'use strict';
/**
 * KenyaWatch AI — AI Investigator Route
 * Uses Google Gemini API (FREE tier — no billing required)
 * Model: gemini-2.0-flash-exp (fast, accurate, free)
 *
 * Get your free API key at: https://aistudio.google.com/apikey
 * Set it as: GEMINI_API_KEY in your Render environment variables
 */

const router = require('express').Router();
const https  = require('https');
const { pool } = require('../db');

// ── Gemini model config ───────────────────────────────────────────────────────
// gemini-2.0-flash-exp = latest, free, fast, very capable
// gemini-1.5-flash      = fallback if 2.0 unavailable
const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_HOST  = 'generativelanguage.googleapis.com';

// ── System instruction for Gemini ─────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `You are KenyaWatch AI, an expert anti-corruption investigator for Kenya.
You are embedded in the KenyaWatch AI platform which monitors government procurement contracts
across all 47 Kenya counties using real PPIP/OCDS data.

YOUR EXPERTISE:
- Kenya Public Procurement and Asset Disposal Act 2015 (PPADA)
- Ethics and Anti-Corruption Commission (EACC) enforcement patterns
- Public Procurement Regulatory Authority (PPRA) guidelines
- County Governments Act 2012 devolved procurement rules
- World Bank, AfDB, EU procurement standards applied in Kenya
- Real fraud patterns identified in Kenya Auditor General reports 2019-2024

FRAUD INDICATORS YOU DETECT:
1. Single-source/direct awards over KES 5M without documented justification = HIGH RISK
2. Supplier company registered less than 12 months before contract award = HIGH RISK
3. Contract value more than 200% above comparable market tenders = PRICE INFLATION
4. Same supplier winning contracts across multiple counties simultaneously = CARTEL PATTERN
5. Director names matching government official family members = CONFLICT OF INTEREST
6. Ghost projects: fully paid contracts with no satellite-verifiable construction = FRAUD
7. Emergency procurement classification used for routine purchases = ABUSE
8. Restricted tender process for contracts above the open tender threshold = VIOLATION
9. Payments released before project completion = PROCUREMENT ABUSE
10. Shell companies with minimal registration details winning large contracts = RED FLAG

KENYA OVERSIGHT BODIES:
- EACC: 0800 720 880 (free, 24/7) | eacc.go.ke | info@eacc.go.ke
- DPP: corruption@dpp.go.ke | dpp.go.ke (for criminal prosecution)
- PPRA: info@ppra.go.ke | ppra.go.ke | tenders.go.ke (procurement complaints)
- Auditor General: oagkenya.go.ke (financial irregularities)
- ODPP: for criminal referrals on grand corruption

RESPONSE RULES:
- Be direct, specific, and data-driven — reference actual contract IDs and values from the data
- Use **bold** for key risk figures, entity names, and contract IDs
- When you see fraud patterns in the data, name them explicitly
- Always end with one clear actionable recommendation
- If asked in Kiswahili, respond in Kiswahili
- Maximum 350 words unless user explicitly asks for a detailed report
- Format with short paragraphs — no walls of text`;

// ── Pull live database context ────────────────────────────────────────────────
async function getLiveContext() {
  try {
    const [contracts, reports, ghosts, stats] = await Promise.all([
      pool.query(`
        SELECT contract_id, description, county, sector, value, supplier,
               bid_type, risk_score, risk_level, flags, awarded_date, procuring_entity
        FROM contracts
        ORDER BY risk_score DESC, value DESC
        LIMIT 30
      `),
      pool.query(`
        SELECT case_number, type, county, sector, description,
               amount, status, ai_credibility_score, routing, created_at
        FROM reports
        ORDER BY created_at DESC
        LIMIT 15
      `),
      pool.query(`
        SELECT contract_ref, project_name, county, sector,
               claimed_status, satellite_status, amount_at_risk,
               detection_status, confidence_score
        FROM ghost_projects
        WHERE detection_status IN ('ghost','partial')
        ORDER BY amount_at_risk DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE risk_level='HIGH')   AS high_risk,
          COUNT(*) FILTER (WHERE risk_level='MEDIUM') AS medium_risk,
          COUNT(*) FILTER (WHERE risk_level='LOW')    AS low_risk,
          COUNT(*)                                     AS total,
          COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS high_risk_value
        FROM contracts
      `),
    ]);

    const s = stats.rows[0];
    const fmt = v => {
      const n = parseInt(v) || 0;
      return n >= 1e9 ? 'KES '+(n/1e9).toFixed(1)+'B'
           : n >= 1e6 ? 'KES '+(n/1e6).toFixed(0)+'M'
           : 'KES '+n.toLocaleString();
    };

    let ctx = `\n\n=== LIVE KENYAWATCH DATABASE (${new Date().toISOString().slice(0,16)} EAT) ===\n`;
    ctx += `SUMMARY: ${s.total} contracts total | HIGH: ${s.high_risk} (${fmt(s.high_risk_value)}) | MEDIUM: ${s.medium_risk} | LOW: ${s.low_risk}\n`;

    if (contracts.rows.length) {
      ctx += `\nTOP CONTRACTS BY RISK SCORE:\n`;
      contracts.rows.forEach(c => {
        const flags = (() => {
          try { return Array.isArray(c.flags) ? c.flags : JSON.parse(c.flags||'[]'); }
          catch { return []; }
        })();
        ctx += `\n• [${c.contract_id}] ${(c.description||'').slice(0,90)}\n`;
        ctx += `  ${c.county||'?'} | ${c.sector||'?'} | ${fmt(c.value)} | ${c.bid_type||'open'} tender\n`;
        ctx += `  Supplier: ${c.supplier||'Unknown'} | RISK: ${c.risk_level} (${c.risk_score}/100)\n`;
        if (c.procuring_entity) ctx += `  Entity: ${c.procuring_entity}\n`;
        if (flags.length) ctx += `  Flags: ${flags.slice(0,3).join(' | ')}\n`;
      });
    }

    if (ghosts.rows.length) {
      ctx += `\nGHOST PROJECTS (satellite-verified fraud):\n`;
      ghosts.rows.forEach(g => {
        ctx += `\n• [${g.contract_ref||'N/A'}] ${g.project_name} (${g.county})\n`;
        ctx += `  Status: ${g.detection_status.toUpperCase()} | Confidence: ${g.confidence_score}% | At risk: ${fmt(g.amount_at_risk)}\n`;
        ctx += `  Claimed: ${(g.claimed_status||'').slice(0,80)}\n`;
        ctx += `  Satellite: ${(g.satellite_status||'').slice(0,80)}\n`;
      });
    }

    if (reports.rows.length) {
      ctx += `\nCITIZEN REPORTS:\n`;
      reports.rows.forEach(r => {
        ctx += `\n• [${r.case_number}] ${r.type} | ${r.county||'Kenya'} | ${r.sector||'Gov'}\n`;
        ctx += `  Status: ${r.status} | AI score: ${r.ai_credibility_score}/100 | Routing: ${r.routing}\n`;
        ctx += `  ${(r.description||'').slice(0,100)}\n`;
      });
    }

    ctx += `\n=== END LIVE DATA ===\n`;
    return ctx;

  } catch (e) {
    console.error('DB context error:', e.message);
    return '\n[Live database context unavailable — answering from training knowledge]\n';
  }
}

// ── Call Gemini API ────────────────────────────────────────────────────────────
function callGemini(history, systemInstruction, userMessage) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('GEMINI_API_KEY not set'));

    // Build Gemini contents array from history + new message
    const contents = [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const body = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature:     0.4,   // Lower = more precise/factual for fraud analysis
        topP:            0.85,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
      ],
    });

    const path = '/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey;

    const options = {
      hostname: GEMINI_HOST,
      path,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          // Handle Gemini error responses
          if (parsed.error) {
            return reject(new Error(parsed.error.message || 'Gemini API error ' + parsed.error.code));
          }

          // Extract text from Gemini response structure
          const candidate = parsed.candidates && parsed.candidates[0];
          if (!candidate) return reject(new Error('No response from Gemini'));

          // Check finish reason
          if (candidate.finishReason === 'SAFETY') {
            return reject(new Error('Response blocked by safety filters'));
          }

          const text = (candidate.content?.parts || [])
            .map(p => p.text || '')
            .join('')
            .trim();

          if (!text) return reject(new Error('Empty response from Gemini'));
          resolve(text);

        } catch (e) {
          reject(new Error('Failed to parse Gemini response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });

    req.write(body);
    req.end();
  });
}

// ── Session memory ─────────────────────────────────────────────────────────────
// Gemini uses {role:'user'|'model', parts:[{text}]} format
const sessions = new Map();
const MAX_TURNS = 10;

function getSession(id) { return sessions.get(id) || []; }
function saveSession(id, contents) {
  sessions.set(id, contents.slice(-(MAX_TURNS * 2)));
}

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { message, session_id } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      success:  true,
      fallback: true,
      reply: '⚠️ **AI not configured yet.**\n\n' +
             'To activate the AI Investigator:\n\n' +
             '1. Go to **https://aistudio.google.com/apikey**\n' +
             '2. Create a free API key (no billing required)\n' +
             '3. In **Render → Your Service → Environment**, add:\n' +
             '   `GEMINI_API_KEY` = your key\n' +
             '4. Click **Save** — the AI activates immediately\n\n' +
             'The Gemini API is **completely free** with generous limits.',
    });
  }

  const sid     = (session_id || 'default').toString().slice(0, 80);
  const userMsg = message.trim().slice(0, 3000);

  try {
    // Get live database context
    const liveContext = await getLiveContext();

    // Full system instruction = base + live data
    const fullSystem = SYSTEM_INSTRUCTION + liveContext;

    // Get conversation history (Gemini format)
    const history = getSession(sid);

    // Call Gemini
    const reply = await callGemini(history, fullSystem, userMsg);

    // Update history in Gemini format
    history.push({ role: 'user',  parts: [{ text: userMsg }] });
    history.push({ role: 'model', parts: [{ text: reply   }] });
    saveSession(sid, history);

    return res.json({
      success:    true,
      reply,
      fallback:   false,
      session_id: sid,
      model:      GEMINI_MODEL,
    });

  } catch (e) {
    console.error('AI chat error:', e.message);

    let reply;
    if (e.message.includes('API_KEY') || e.message.includes('400') || e.message.includes('401') || e.message.includes('403')) {
      reply = '⚠️ **Invalid Gemini API key.**\n\nPlease check that `GEMINI_API_KEY` is correctly set in your Render environment variables.\n\nGet a free key at: **https://aistudio.google.com/apikey**';
    } else if (e.message.includes('quota') || e.message.includes('429') || e.message.includes('RESOURCE_EXHAUSTED')) {
      reply = '⏱️ **API rate limit reached.** The free Gemini tier allows 15 requests/minute and 1500/day.\n\nPlease wait a moment and try again.';
    } else if (e.message.includes('timeout')) {
      reply = '⏱️ Request timed out. Please try again — this is usually temporary.';
    } else {
      reply = '❌ AI error: ' + e.message + '\n\nPlease try again. If the problem persists, check your `GEMINI_API_KEY` in Render environment variables.';
    }

    return res.json({ success: true, reply, fallback: true, error: e.message });
  }
});

// ── GET /api/ai/status ────────────────────────────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({
    success:  true,
    ai_ready: !!process.env.GEMINI_API_KEY,
    provider: 'Google Gemini',
    model:    GEMINI_MODEL,
    free:     true,
    sessions: sessions.size,
  });
});

// ── DELETE /api/ai/session/:id ────────────────────────────────────────────────
router.delete('/session/:id', (req, res) => {
  sessions.delete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
