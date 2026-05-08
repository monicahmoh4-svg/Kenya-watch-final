'use strict';
/**
 * KenyaWatch AI — Chatbot Widget Route
 * POST /api/chatbot/message
 *
 * CORRECT Gemini REST endpoint:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
 *   Header: x-goog-api-key: YOUR_KEY
 *
 * Falls back to keyword responses when API key not set or Gemini unavailable.
 */

const router = require('express').Router();
const https  = require('https');

const GEMINI_MODEL    = 'gemini-2.5-flash';
const GEMINI_HOSTNAME = 'generativelanguage.googleapis.com';
const GEMINI_PATH     = '/v1beta/models/' + GEMINI_MODEL + ':generateContent';

// ── System instruction ────────────────────────────────────────────────────────
const SYSTEM = `You are KenyaWatch AI, a friendly anti-corruption assistant for Kenya.
Help citizens report corruption, understand their rights, and use the KenyaWatch platform.

WHAT YOU KNOW:
- How to report corruption anonymously and safely
- EACC hotline: 0800 720 880 (free, 24/7)
- DPP: corruption@dpp.go.ke
- PPRA: ppra.go.ke | tenders.go.ke
- Kenya whistleblower protections
- How KenyaWatch platform features work

STYLE:
- Warm, helpful, encouraging
- Plain language — no legal jargon
- If user writes Kiswahili → reply in Kiswahili
- Under 120 words per reply
- Always give one clear next step`;

// ── Keyword fallback responses ─────────────────────────────────────────────────
function fallback(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('habari') || m.includes('mambo') || m.includes('nisaidie') || m.includes('hujambo')) {
    return 'Habari! Mimi ni **KenyaWatch AI** 👋\n\nNinaweza kukusaidia:\n- Kuripoti ufisadi kwa usalama\n- Kuangalia mikataba ya serikali\n- Kupata taarifa za miradi ya bandia\n\n**EACC: 0800 720 880** (bure, saa 24)';
  }
  if (m.includes('report') || m.includes('bribe') || m.includes('corrupt') || m.includes('rushwa') || m.includes('ripoti')) {
    return 'To report corruption safely:\n\n1. Click **🚨 Report** in the menu\n2. Your identity is **never stored**\n3. AI routes your report to EACC, DPP, or PPRA\n4. You receive a case number to track\n\n**EACC: 0800 720 880** (free, 24/7)';
  }
  if (m.includes('contract') || m.includes('tender') || m.includes('procurement')) {
    return 'To check a government contract:\n\n1. Go to **📋 Procurement**\n2. Click **+ Scan Contract**\n3. Enter details — AI gives a fraud **risk score 0–100**\n\nFilter contracts by county, sector, or risk level to find suspicious ones.';
  }
  if (m.includes('ghost') || m.includes('satellite') || m.includes('project')) {
    return '**Ghost Project Detector** uses Sentinel-2 satellite imagery:\n\n🔴 **GHOST** — Paid for, never built\n🟡 **PARTIAL** — Incomplete despite full payment\n🟢 **VERIFIED** — Confirmed built\n\nSee all detections under **👻 Ghost Projects**.';
  }
  if (m.includes('eacc') || m.includes('dpp') || m.includes('ppra') || m.includes('contact')) {
    return '**Anti-Corruption Contacts:**\n\n📞 **EACC:** 0800 720 880 (free, 24/7)\n🌐 eacc.go.ke\n\n📧 **DPP:** corruption@dpp.go.ke\n\n🌐 **PPRA:** ppra.go.ke\n\nReport anonymously via this platform anytime.';
  }
  if (m.includes('admin') || m.includes('dashboard')) {
    return 'The **Admin Dashboard** is at **/admin** — it gives full access to contracts, reports, ghost projects, and the AI investigation console.\n\nAsk me anything about Kenya corruption or how to use KenyaWatch!';
  }
  return 'I\'m **KenyaWatch AI** 👋\n\nI can help you:\n- **Report corruption** anonymously\n- **Check contracts** for fraud\n- **Track ghost projects** via satellite\n\n**EACC: 0800 720 880** (free, 24/7)\n\nWhat would you like to do?';
}

// ── Call Gemini ────────────────────────────────────────────────────────────────
function callGemini(history, userMessage) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('no_key'));

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      generationConfig: {
        temperature:     0.5,
        maxOutputTokens: 300,
      },
    });

    const options = {
      hostname: GEMINI_HOSTNAME,
      path:     GEMINI_PATH,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-goog-api-key': apiKey,          // ← correct auth header
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const p = JSON.parse(raw);
          if (p.error) return reject(new Error(p.error.message || 'Gemini error'));
          const text = ((p.candidates||[])[0]?.content?.parts||[]).map(x => x.text||'').join('').trim();
          if (!text) return reject(new Error('empty'));
          resolve(text);
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Session memory ─────────────────────────────────────────────────────────────
const sessions = new Map();
function getSession(id) { return sessions.get(id) || []; }
function saveSession(id, msgs) { sessions.set(id, msgs.slice(-16)); }

// ── POST /api/chatbot/message ─────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  const { message, session_id } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  const sid     = String(session_id || 'default').slice(0, 80);
  const userMsg = String(message).trim().slice(0, 1000);

  try {
    const history = getSession(sid);
    const reply   = await callGemini(history, userMsg);

    history.push({ role: 'user',  parts: [{ text: userMsg }] });
    history.push({ role: 'model', parts: [{ text: reply   }] });
    saveSession(sid, history);

    return res.json({ success: true, reply, fallback: false, session_id: sid });

  } catch (_) {
    // Graceful fallback — chatbot always responds even without Gemini
    return res.json({ success: true, reply: fallback(userMsg), fallback: true, session_id: sid });
  }
});

// ── GET /api/chatbot/status ────────────────────────────────────────────────────
router.get('/status', (_req, res) => res.json({
  success:  true,
  ai_ready: !!process.env.GEMINI_API_KEY,
  model:    GEMINI_MODEL,
}));

// ── GET/DELETE /api/chatbot/history/:id ──────────────────────────────────────
router.get('/history/:id',    (req, res) => res.json({ success: true, data: getSession(req.params.id) }));
router.delete('/history/:id', (req, res) => { sessions.delete(req.params.id); res.json({ success: true }); });

module.exports = router;
