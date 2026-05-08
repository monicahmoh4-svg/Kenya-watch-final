'use strict';
/**
 * KenyaWatch AI — AI Investigator Route
 *
 * CORRECT Gemini REST endpoint (confirmed from Google AI docs May 2026):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
 *   Header: x-goog-api-key: YOUR_KEY   ← API key goes in HEADER, not URL query param
 *
 * Model: gemini-2.5-flash (current stable free model, replaces 1.5-flash and 2.0-flash-exp)
 * Free tier: 15 requests/min, 1500 requests/day — no billing needed
 * Get key free: https://aistudio.google.com/apikey
 */

const router = require('express').Router();
const https  = require('https');
const { pool } = require('../db');

const GEMINI_MODEL    = 'gemini-2.5-flash';
const GEMINI_HOSTNAME = 'generativelanguage.googleapis.com';
const GEMINI_PATH     = '/v1beta/models/' + GEMINI_MODEL + ':generateContent';

// ── System instruction ────────────────────────────────────────────────────────
const SYSTEM = `You are KenyaWatch AI, an expert anti-corruption investigator for Kenya.
You work inside the KenyaWatch AI platform which monitors government procurement contracts
across all 47 Kenya counties using real data from the PPRA Public Procurement Portal.

YOUR FRAUD DETECTION EXPERTISE:
- Kenya PPADA 2015 (Public Procurement and Asset Disposal Act)
- EACC enforcement patterns and common corruption methods
- PPRA procurement guidelines and legal thresholds
- Patterns from Kenya Auditor General reports 2019-2025

RED FLAGS YOU IDENTIFY:
1. Single-source/direct award over KES 5M without justification → HIGH RISK
2. Supplier registered under 12 months before contract award → HIGH RISK
3. Contract value over 200% of comparable market tenders → PRICE INFLATION
4. Same supplier in multiple counties simultaneously → CARTEL PATTERN
5. Director linked to government official → CONFLICT OF INTEREST
6. Fully paid contract with no satellite-detected construction → GHOST PROJECT
7. Emergency procurement classification for routine work → ABUSE OF PROCESS
8. Payment released before project completion → PROCUREMENT VIOLATION

CONTACTS:
- EACC: 0800 720 880 (free, 24/7) | eacc.go.ke
- DPP: corruption@dpp.go.ke (criminal cases)
- PPRA: info@ppra.go.ke | tenders.go.ke (procurement violations)
- Auditor General: oagkenya.go.ke (financial irregularities)

HOW TO RESPOND:
- Reference actual contract IDs and values from the live data I provide
- Use **bold** for key risk figures, entities, amounts
- Kiswahili input → respond in Kiswahili
- Keep responses under 350 words unless a full report is requested
- Always end with one concrete next action for the user`;

// ── Fetch live database context ───────────────────────────────────────────────
async function getLiveContext() {
  try {
    const [cRes, rRes, gRes, sRes] = await Promise.all([
      pool.query(`SELECT contract_id,description,county,sector,value,supplier,
                         bid_type,risk_score,risk_level,flags,procuring_entity
                  FROM contracts ORDER BY risk_score DESC,value DESC LIMIT 25`),
      pool.query(`SELECT case_number,type,county,sector,description,
                         amount,status,ai_credibility_score,routing
                  FROM reports ORDER BY created_at DESC LIMIT 10`),
      pool.query(`SELECT contract_ref,project_name,county,sector,claimed_status,
                         satellite_status,amount_at_risk,detection_status,confidence_score
                  FROM ghost_projects WHERE detection_status IN ('ghost','partial')
                  ORDER BY amount_at_risk DESC LIMIT 8`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE risk_level='HIGH')   AS h,
                         COUNT(*) FILTER (WHERE risk_level='MEDIUM') AS m,
                         COUNT(*) FILTER (WHERE risk_level='LOW')    AS l,
                         COUNT(*)                                     AS t,
                         COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS hv
                  FROM contracts`),
    ]);

    const s   = sRes.rows[0];
    const fmt = n => {
      const v = parseInt(n) || 0;
      return v >= 1e9 ? 'KES '+(v/1e9).toFixed(1)+'B' : v >= 1e6 ? 'KES '+(v/1e6).toFixed(0)+'M' : 'KES '+v.toLocaleString();
    };

    let ctx = `\n\n=== LIVE KENYAWATCH DATABASE (${new Date().toISOString().slice(0,16)} EAT) ===\n`;
    ctx += `SUMMARY: ${s.t} contracts total | HIGH RISK: ${s.h} worth ${fmt(s.hv)} | MEDIUM: ${s.m} | LOW: ${s.l}\n`;

    if (cRes.rows.length) {
      ctx += `\nCONTRACTS (top by risk score):\n`;
      cRes.rows.forEach(c => {
        const fl = (() => { try { return Array.isArray(c.flags)?c.flags:JSON.parse(c.flags||'[]'); } catch{return[];} })();
        ctx += `• [${c.contract_id}] ${(c.description||'').slice(0,85)}\n`;
        ctx += `  County:${c.county||'?'} Sector:${c.sector||'?'} Value:${fmt(c.value)} Bid:${c.bid_type||'open'}\n`;
        ctx += `  Supplier:${c.supplier||'Unknown'} | RISK:${c.risk_level} score:${c.risk_score}/100\n`;
        if (c.procuring_entity) ctx += `  Entity:${c.procuring_entity}\n`;
        if (fl.length) ctx += `  Flags: ${fl.slice(0,3).join(' | ')}\n`;
      });
    }

    if (gRes.rows.length) {
      ctx += `\nGHOST PROJECTS:\n`;
      gRes.rows.forEach(g => {
        ctx += `• [${g.contract_ref||'?'}] ${g.project_name} (${g.county}) ${g.detection_status.toUpperCase()} ${g.confidence_score}%conf ${fmt(g.amount_at_risk)}\n`;
        ctx += `  Claimed:${(g.claimed_status||'').slice(0,60)} | Satellite:${(g.satellite_status||'').slice(0,60)}\n`;
      });
    }

    if (rRes.rows.length) {
      ctx += `\nCITIZEN REPORTS:\n`;
      rRes.rows.forEach(r => {
        ctx += `• [${r.case_number}] ${r.type} | ${r.county||'?'} | ${r.status} | score:${r.ai_credibility_score}/100\n`;
        ctx += `  ${(r.description||'').slice(0,90)}\n`;
      });
    }

    ctx += `=== END LIVE DATA ===\n`;
    return ctx;
  } catch (e) {
    console.error('DB context error:', e.message);
    return '\n[DB context temporarily unavailable]\n';
  }
}

// ── Gemini API call ────────────────────────────────────────────────────────────
function callGemini(history, systemText, userMessage) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('GEMINI_API_KEY environment variable is not set'));

    const body = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemText }],
      },
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      generationConfig: {
        temperature:     0.35,
        topP:            0.9,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
      ],
    });

    const options = {
      hostname: GEMINI_HOSTNAME,
      path:     GEMINI_PATH,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-goog-api-key': apiKey,              // ← correct header (not URL param)
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);

          // Surface Gemini error messages clearly
          if (parsed.error) {
            const msg = parsed.error.message || ('Gemini API error code ' + parsed.error.code);
            return reject(new Error(msg));
          }

          const candidate = (parsed.candidates || [])[0];
          if (!candidate) {
            return reject(new Error('Gemini returned no candidates. HTTP status: ' + res.statusCode));
          }
          if (candidate.finishReason === 'SAFETY') {
            return reject(new Error('Response blocked by Gemini safety filters'));
          }

          const text = (candidate.content?.parts || []).map(p => p.text || '').join('').trim();
          if (!text) return reject(new Error('Gemini returned empty response text'));

          resolve(text);
        } catch (e) {
          reject(new Error('JSON parse failed: ' + e.message + ' | Response: ' + raw.slice(0, 300)));
        }
      });
    });

    req.on('error', err => reject(new Error('Network error: ' + err.message)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Gemini request timed out')); });
    req.write(body);
    req.end();
  });
}

// ── Session memory ────────────────────────────────────────────────────────────
const sessions = new Map();
function getSession(id) { return sessions.get(id) || []; }
function saveSession(id, msgs) { sessions.set(id, msgs.slice(-20)); }

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { message, session_id } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      success: true, fallback: true,
      reply:
        '⚠️ **AI investigator not activated yet.**\n\n' +
        'To activate for free:\n' +
        '1. Visit **https://aistudio.google.com/apikey**\n' +
        '2. Sign in with Google → **Create API key**\n' +
        '3. In Render → **Environment** → add: `GEMINI_API_KEY` = your key\n' +
        '4. Save — AI activates on next request\n\n' +
        '_No billing or credit card required._',
    });
  }

  const sid     = String(session_id || 'default').slice(0, 80);
  const userMsg = String(message).trim().slice(0, 3000);

  try {
    const liveCtx = await getLiveContext();
    const fullSys = SYSTEM + liveCtx;
    const history = getSession(sid);
    const reply   = await callGemini(history, fullSys, userMsg);

    history.push({ role: 'user',  parts: [{ text: userMsg }] });
    history.push({ role: 'model', parts: [{ text: reply   }] });
    saveSession(sid, history);

    return res.json({ success: true, reply, fallback: false, session_id: sid, model: GEMINI_MODEL });

  } catch (e) {
    console.error('AI chat error:', e.message);

    let reply;
    const m = e.message.toLowerCase();

    if (m.includes('api_key') || m.includes('invalid') || m.includes('401') || m.includes('403')) {
      reply = '⚠️ **Invalid Gemini API key.**\n\nCheck that `GEMINI_API_KEY` is correctly set in Render → Environment Variables.\n\nGet a free key at **https://aistudio.google.com/apikey**';
    } else if (m.includes('resource_exhausted') || m.includes('429') || m.includes('quota')) {
      reply = '⏱️ **Rate limit hit.** Free tier: 15 requests/minute. Please wait 60 seconds and try again.';
    } else if (m.includes('timeout')) {
      reply = '⏱️ Request timed out — please try again.';
    } else if (m.includes('not found') || m.includes('404')) {
      reply = '❌ Model unavailable. Please verify your `GEMINI_API_KEY` is valid and active.';
    } else {
      reply = '❌ **AI error:** ' + e.message + '\n\nPlease try again. If this persists, check `GEMINI_API_KEY` in your Render environment.';
    }

    return res.json({ success: true, reply, fallback: true, error: e.message });
  }
});

// ── GET /api/ai/status ────────────────────────────────────────────────────────
router.get('/status', (_req, res) => res.json({
  success:  true,
  ai_ready: !!process.env.GEMINI_API_KEY,
  provider: 'Google Gemini',
  model:    GEMINI_MODEL,
  endpoint: GEMINI_HOSTNAME + GEMINI_PATH,
}));

// ── DELETE /api/ai/session/:id ────────────────────────────────────────────────
router.delete('/session/:id', (req, res) => {
  sessions.delete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
