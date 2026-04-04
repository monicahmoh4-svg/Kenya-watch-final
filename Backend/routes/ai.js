'use strict';

const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../db');
const { validateChatMessage } = require('../utils/validators');
const { successResponse, errorResponse, formatKES } = require('../utils/helpers');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are KenyaWatch AI, an expert anti-corruption intelligence assistant for Kenya.

You have deep expertise in:
- Kenya government procurement law (Public Procurement and Asset Disposal Act 2015)
- PPRA (Public Procurement Regulatory Authority) regulations
- EACC (Ethics and Anti-Corruption Commission) procedures
- Kenya county government corruption patterns
- Ghost project detection and satellite verification
- Supplier collusion and cartel behaviour in tenders
- Red flags in government contracts: price inflation, single-source awards, connected suppliers
- Kenya's 47 counties and their specific corruption risk profiles
- Whistleblower protection under Kenya's Witness Protection Act

When analysing contracts or reports:
1. Identify specific red flags with evidence
2. Quantify the risk (score 0-100)
3. Name the relevant oversight body (EACC, DPP, PPRA, Auditor General)
4. Give a concrete next action step
5. Reference relevant Kenya law where applicable

Communication style:
- Be concise, factual, and Kenya-specific
- Use **bold** for key figures, names, and risk scores
- Use bullet points for lists of flags or actions
- Always end with a clear, actionable recommendation
- Keep responses under 300 words unless detailed analysis is requested
- Use KES for currency amounts

You have access to the KenyaWatch database context provided in each message.`;

// ── Build database context for AI ─────────────────────────────────────────────
const buildDatabaseContext = async () => {
  try {
    const [contracts, reports, ghosts] = await Promise.all([
      pool.query(`
        SELECT contract_id, description, county, value, supplier, risk_score, risk_level,
               flags::text AS flags_text
        FROM contracts
        ORDER BY risk_score DESC
        LIMIT 20
      `),
      pool.query(`
        SELECT case_number, type, county, sector, status, ai_credibility_score, amount
        FROM reports
        ORDER BY created_at DESC
        LIMIT 15
      `),
      pool.query(`
        SELECT project_name, county, claimed_status, satellite_status,
               amount_at_risk, detection_status
        FROM ghost_projects
        ORDER BY CASE detection_status WHEN 'ghost' THEN 1 WHEN 'partial' THEN 2 ELSE 3 END
        LIMIT 10
      `)
    ]);

    const highRisk = contracts.rows.filter(c => c.risk_level === 'HIGH');
    const totalFlagged = highRisk.reduce((s, c) => s + (parseInt(c.value) || 0), 0);
    const ghostCount = ghosts.rows.filter(g => g.detection_status === 'ghost').length;
    const pendingReports = reports.rows.filter(r => r.status === 'pending').length;

    return `
=== KENYAWATCH DATABASE CONTEXT ===

SUMMARY:
- Total contracts monitored: ${contracts.rows.length} (showing top 20 by risk)
- High-risk contracts: ${highRisk.length} | Total value at risk: ${formatKES(totalFlagged)}
- Ghost projects detected: ${ghostCount} | Pending citizen reports: ${pendingReports}

TOP HIGH-RISK CONTRACTS:
${highRisk.slice(0, 8).map(c =>
  `• ${c.contract_id} | ${c.county} | ${formatKES(c.value)} | Supplier: ${c.supplier} | Score: ${c.risk_score}/100 | ${c.risk_level}`
).join('\n')}

RECENT CITIZEN REPORTS:
${reports.rows.slice(0, 8).map(r =>
  `• ${r.case_number} | ${r.type} | ${r.county || 'N/A'} | ${r.sector || 'N/A'} | Status: ${r.status} | Credibility: ${r.ai_credibility_score}/100`
).join('\n')}

GHOST PROJECTS:
${ghosts.rows.map(g =>
  `• ${g.project_name} | ${g.county} | Claimed: "${g.claimed_status}" | Satellite: "${g.satellite_status}" | At Risk: ${formatKES(g.amount_at_risk)} | Status: ${g.detection_status.toUpperCase()}`
).join('\n')}

=== END CONTEXT ===
`;
  } catch (e) {
    console.error('Failed to build DB context:', e.message);
    return '=== DATABASE CONTEXT UNAVAILABLE ===';
  }
};

// ── Fetch conversation history ────────────────────────────────────────────────
const getConversationHistory = async (session_id, limit = 10) => {
  if (!session_id) return [];
  try {
    const { rows } = await pool.query(
      `SELECT role, content FROM chat_logs
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [session_id, limit * 2]
    );
    return rows.reverse().map(r => ({ role: r.role, content: r.content }));
  } catch {
    return [];
  }
};

// ── Save message to chat log ──────────────────────────────────────────────────
const saveMessage = (session_id, role, content) => {
  if (!session_id) return;
  pool.query(
    'INSERT INTO chat_logs (session_id, role, content) VALUES ($1, $2, $3)',
    [session_id, role, content]
  ).catch(e => console.error('Chat log save error:', e.message));
};

// ── POST /api/ai/chat — main chat endpoint ────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { valid, errors } = validateChatMessage(req.body);
  if (!valid) return errorResponse(res, 400, errors.join('; '), 'VALIDATION_ERROR');

  const { message, session_id } = req.body;

  try {
    const [dbContext, history] = await Promise.all([
      buildDatabaseContext(),
      getConversationHistory(session_id)
    ]);

    const messages = [];

    // Add conversation history (max 10 turns)
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }

    // Add current message with database context
    const userContent = `${dbContext}\n\nUSER QUESTION: ${message}`;
    messages.push({ role: 'user', content: userContent });

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages
    });

    const reply = response.content.map(b => b.text || '').join('').trim();

    // Save both messages to history
    saveMessage(session_id, 'user', message);
    saveMessage(session_id, 'assistant', reply);

    res.json({ success: true, reply });
  } catch (e) {
    console.error('AI chat error:', e.message);
    const fallback = generateFallbackResponse(message);
    res.json({ success: true, reply: fallback, fallback: true });
  }
});

// ── POST /api/ai — alias for /api/ai/chat ─────────────────────────────────────
router.post('/', (req, res, next) => {
  req.url = '/chat';
  router.handle(req, res, next);
});

// ── GET /api/ai/history/:session_id — fetch chat history ─────────────────────
router.get('/history/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;
    const { rows } = await pool.query(
      `SELECT role, content, created_at FROM chat_logs
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT 50`,
      [session_id]
    );
    successResponse(res, rows);
  } catch (e) {
    errorResponse(res, 500, 'Failed to retrieve history', 'DB_ERROR');
  }
});

// ── POST /api/ai/analyse-contract — deep contract analysis ───────────────────
router.post('/analyse-contract', async (req, res) => {
  const { contract_id } = req.body;
  if (!contract_id) return errorResponse(res, 400, 'contract_id is required', 'VALIDATION_ERROR');

  try {
    const { rows } = await pool.query(
      'SELECT * FROM contracts WHERE contract_id = $1',
      [contract_id]
    );
    if (!rows.length) return errorResponse(res, 404, 'Contract not found', 'NOT_FOUND');

    const contract = rows[0];
    const flags = Array.isArray(contract.flags) ? contract.flags : JSON.parse(contract.flags || '[]');

    const prompt = `Perform a detailed anti-corruption analysis of this Kenya government contract:

Contract ID: ${contract.contract_id}
Description: ${contract.description}
County: ${contract.county}
Value: ${formatKES(contract.value)}
Supplier: ${contract.supplier}
AI Risk Score: ${contract.risk_score}/100 (${contract.risk_level})
Risk Flags: ${flags.join('; ')}

Provide:
1. Summary of key red flags
2. Estimated overpricing (if any)
3. Recommended investigation steps
4. Which oversight body should act (EACC/DPP/PPRA/Auditor General)
5. Urgency level (CRITICAL/HIGH/MEDIUM/LOW)`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const analysis = response.content.map(b => b.text || '').join('').trim();
    successResponse(res, { contract, analysis });
  } catch (e) {
    console.error('Contract analysis error:', e.message);
    errorResponse(res, 500, 'Analysis service temporarily unavailable', 'AI_ERROR');
  }
});

// ── Intelligent fallback responses ────────────────────────────────────────────
const generateFallbackResponse = (message) => {
  const msg = message.toLowerCase();

  if (msg.includes('ghost') || msg.includes('satellite')) {
    return `**Ghost Project Detection** uses satellite imagery (Sentinel-2, Landsat-8) to verify whether funded government projects actually exist on the ground.\n\n**How it works:**\n• Satellite images are captured every 30 days for each project GPS coordinate\n• AI vision model compares imagery against contract description\n• Projects are classified as: **Ghost** (no structure), **Partial** (incomplete), or **Verified** (complete)\n\n**Action:** Ghost projects should be reported immediately to **EACC** (0800 720 880) and the **Auditor General's office**.`;
  }

  if (msg.includes('risk') || msg.includes('contract') || msg.includes('tender')) {
    return `**Contract Risk Scoring** analyses multiple factors:\n\n• **Price anomaly** — deviation from market benchmarks (0–30 pts)\n• **Supplier track record** — prior contracts and risk history (0–25 pts)\n• **Competitive bidding** — single-source vs open tender (0–20 pts)\n• **Official connections** — conflict of interest indicators (0–15 pts)\n• **County/sector risk** — historical corruption patterns (0–10 pts)\n\n**Score interpretation:** 75–100 = HIGH risk, 45–74 = MEDIUM, 0–44 = LOW\n\n**Action:** HIGH-risk contracts should be referred to **PPRA** for procurement audit.`;
  }

  if (msg.includes('report') || msg.includes('brib') || msg.includes('corrupt')) {
    return `**Reporting Corruption in Kenya:**\n\n• **EACC** — Ethics & Anti-Corruption Commission: 0800 720 880 (toll-free) or eacc.go.ke\n• **DPP** — Director of Public Prosecutions: corruption@dpp.go.ke\n• **PPRA** — Procurement fraud: ppra.go.ke\n• **Auditor General** — Public funds misuse: oagkenya.go.ke\n\n**Your report is protected** under the Witness Protection Act (Cap 79) and the Whistleblower Protection Bill.\n\n**Action:** Use the Report tab to submit anonymously. Your identity is never stored.`;
  }

  if (msg.includes('county') || msg.includes('nairobi') || msg.includes('mombasa') || msg.includes('kisumu')) {
    return `**Kenya County Corruption Risk Index (KenyaWatch AI):**\n\n🔴 **HIGH RISK:** Nairobi (92), Kiambu (87), Mombasa (81)\n🟡 **MEDIUM RISK:** Nakuru (68), Kakamega (61), Kisumu (55)\n🟢 **LOWER RISK:** Kisii (38), Turkana (29)\n\nHigh-risk counties show patterns of: procurement fraud, ghost projects, and supplier collusion.\n\n**Action:** Focus monitoring on Roads, Health, and Education sectors in high-risk counties.`;
  }

  return `**KenyaWatch AI** is temporarily operating in offline mode.\n\nI can help you with:\n• **Contract analysis** — risk scoring and red flag identification\n• **Ghost project detection** — satellite vs claimed status\n• **Corruption reporting** — how to report and who to contact\n• **County risk profiles** — corruption patterns by county\n• **Supplier networks** — collusion and repeat offender detection\n\nPlease try your question again, or contact **EACC** directly at 0800 720 880 for urgent matters.`;
};

module.exports = router;
