'use strict';
const router = require('express').Router();
const { pool } = require('../db');
const { safeJSON } = require('../utils/helpers');

let anthropic;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} catch (e) {
  console.warn('Anthropic SDK not initialised — AI chat will return fallback responses');
}

const SYSTEM_PROMPT = `You are KenyaWatch AI, Kenya's premier anti-corruption intelligence assistant with real-time access to Kenya's government procurement database.

Your expertise covers:
- Kenya's Public Procurement and Asset Disposal Act (2015, amended 2025)
- Ethics and Anti-Corruption Commission (EACC) processes
- Director of Public Prosecutions (DPP) referral procedures  
- Public Procurement Regulatory Authority (PPRA) oversight
- Kenya Revenue Authority (KRA) tax compliance for suppliers
- County government procurement under the County Governments Act
- World Bank, AFDB, EU procurement standards applicable in Kenya
- M-Pesa and digital financial fraud patterns

When database context is provided, analyse it thoroughly and cite specific contracts, case numbers, or project names.
Be concise, factual, and Kenya-specific. Use **bold** for key figures and entities.
Always end with a clear, actionable recommendation.
Keep responses under 350 words unless deep analysis is explicitly requested.`;

// Build DB context for AI
async function buildContext() {
  try {
    const [stats, highRisk, reports, ghosts] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS contracts, SUM(CASE WHEN risk_level='HIGH' THEN 1 ELSE 0 END) AS high_risk, COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS flagged_value FROM contracts`),
      pool.query(`SELECT contract_id, description, county, value, supplier, risk_score, flags FROM contracts WHERE risk_level='HIGH' ORDER BY risk_score DESC LIMIT 8`),
      pool.query(`SELECT case_number, type, county, status, ai_credibility_score FROM reports ORDER BY created_at DESC LIMIT 6`),
      pool.query(`SELECT project_name, county, detection_status, amount_at_risk, confidence_score FROM ghost_projects WHERE detection_status IN ('ghost','partial') LIMIT 6`),
    ]);

    const s = stats.rows[0];
    return `
=== LIVE KENYAWATCH DATABASE CONTEXT ===
Platform stats: ${s.contracts} contracts monitored, ${s.high_risk} high-risk (KES ${(s.flagged_value/1e9).toFixed(2)}B at risk)

TOP HIGH-RISK CONTRACTS:
${highRisk.rows.map(c => `• ${c.contract_id} | ${c.description} | ${c.county} | KES ${(c.value/1e6).toFixed(0)}M | Score: ${c.risk_score}/100 | Supplier: ${c.supplier} | Flags: ${safeJSON(c.flags).slice(0,2).join('; ')}`).join('\n')}

RECENT CITIZEN REPORTS:
${reports.rows.map(r => `• ${r.case_number} | ${r.type} | ${r.county||'N/A'} | Status: ${r.status} | Credibility: ${r.ai_credibility_score}/100`).join('\n')}

GHOST PROJECTS DETECTED:
${ghosts.rows.map(g => `• ${g.project_name} | ${g.county} | ${g.detection_status.toUpperCase()} | KES ${(g.amount_at_risk/1e6).toFixed(0)}M at risk | Confidence: ${g.confidence_score}%`).join('\n')}
========================================`;
  } catch {
    return '=== Database context temporarily unavailable ===';
  }
}

// POST /api/ai/chat — main chat endpoint
router.post('/chat', async (req, res, next) => {
  try {
    const { message, session_id } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    // Log user message
    if (session_id) {
      pool.query('INSERT INTO chat_logs (session_id, role, content) VALUES ($1,$2,$3)', [session_id, 'user', message]).catch(() => {});
    }

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY || !anthropic) {
      return res.json({
        success: true,
        reply: '**KenyaWatch AI is ready**, but the AI API key has not been configured on this server.\n\nTo enable AI chat:\n1. Go to console.anthropic.com and generate an API key\n2. In Railway dashboard → backend service → Variables → add `ANTHROPIC_API_KEY` = your key\n3. Railway will redeploy automatically\n\nThe rest of the platform (contracts, reports, ghost projects) is fully operational.',
        fallback: true,
      });
    }

    const dbContext = await buildContext();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT + '\n\n' + dbContext,
      messages: [{ role: 'user', content: message }],
    });

    const reply = response.content.map(b => b.text || '').join('');

    // Log AI reply
    if (session_id) {
      pool.query('INSERT INTO chat_logs (session_id, role, content, metadata) VALUES ($1,$2,$3,$4)',
        [session_id, 'assistant', reply, JSON.stringify({ model: response.model, tokens: response.usage })]
      ).catch(() => {});
    }

    res.json({ success: true, reply });
  } catch (err) {
    // Specific error for API key issues
    if (err.status === 401 || err.message?.includes('API key')) {
      return res.json({
        success: true,
        reply: '**AI service configuration error.** The ANTHROPIC_API_KEY environment variable is missing or invalid.\n\nPlease add it in Railway → backend service → Variables tab:\n`ANTHROPIC_API_KEY = sk-ant-...`\n\nAll other platform features are working normally.',
        fallback: true,
      });
    }
    next(err);
  }
});

// POST /api/ai/analyse-contract — deep contract analysis
router.post('/analyse-contract', async (req, res, next) => {
  try {
    const { contract_id } = req.body;
    if (!contract_id) return res.status(400).json({ success: false, error: 'contract_id is required' });

    const { rows } = await pool.query('SELECT * FROM contracts WHERE contract_id=$1 OR id=$1::integer', [contract_id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Contract not found' });
    const c = { ...rows[0], flags: safeJSON(rows[0].flags) };

    // Check API
    if (!process.env.ANTHROPIC_API_KEY || !anthropic) {
      return res.json({ success: true, data: c, analysis: 'AI analysis unavailable — ANTHROPIC_API_KEY not set', fallback: true });
    }

    const prompt = `Analyse this Kenya government contract for corruption risk:

Contract: ${c.contract_id}
Description: ${c.description}
County: ${c.county} | Sector: ${c.sector}
Value: KES ${(c.value/1e6).toFixed(1)}M
Supplier: ${c.supplier}
Bid Type: ${c.bid_type}
Awarded: ${c.awarded_date}
AI Risk Score: ${c.risk_score}/100 (${c.risk_level})
Flags detected: ${c.flags.join('; ')}
Procuring Entity: ${c.procuring_entity}

Provide: 1) Risk summary 2) Most concerning flags 3) Investigation priority 4) Recommended oversight action`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = response.content.map(b => b.text || '').join('');
    res.json({ success: true, data: c, analysis });
  } catch (err) { next(err); }
});

// GET /api/ai/history/:session_id — chat history
router.get('/history/:session_id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT role, content, created_at FROM chat_logs WHERE session_id=$1 ORDER BY created_at ASC LIMIT 100',
      [req.params.session_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
