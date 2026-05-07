'use strict';
/**
 * KenyaWatch AI — Chatbot Widget Route
 * POST /api/chatbot/message
 *
 * Powers the floating chat widget in the bottom-right corner.
 * Uses Google Gemini API (free tier).
 * Falls back to keyword responses when API key not set.
 */

const router = require('express').Router();
const https  = require('https');

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_HOST  = 'generativelanguage.googleapis.com';

// ── Chatbot system instruction ────────────────────────────────────────────────
const SYSTEM = `You are KenyaWatch AI, a friendly and knowledgeable anti-corruption assistant for Kenya.
You help citizens report corruption, understand their rights, and navigate Kenya's oversight systems.

WHAT YOU KNOW:
- How to report corruption anonymously and safely in Kenya
- EACC (Ethics and Anti-Corruption Commission) — 0800 720 880 (free)
- DPP (Director of Public Prosecutions) — corruption@dpp.go.ke
- PPRA (Public Procurement Regulatory Authority) — ppra.go.ke
- Kenya's whistleblower protections under the Whistleblower Protection Act
- How the KenyaWatch platform works (contracts, ghost projects, reports, AI analysis)
- Kenya procurement law (PPADA 2015)

PERSONALITY:
- Warm, helpful, and encouraging
- Speak plainly — avoid legal jargon unless explaining it
- If user writes in Kiswahili, reply in Kiswahili
- Keep replies concise (under 150 words)
- Always give one clear next step
- Never discourage someone from reporting — reporting is safe and anonymous here`;

// ── Call Gemini ────────────────────────────────────────────────────────────────
function callGemini(messages) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('no_key'));

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: messages,
      generationConfig: {
        temperature:     0.5,
        maxOutputTokens: 400,
      },
    });

    const path = '/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey;
    const options = {
      hostname: GEMINI_HOST,
      path,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return reject(new Error(p.error.message || 'Gemini error'));
          const text = ((p.candidates||[])[0]?.content?.parts||[]).map(x=>x.text||'').join('').trim();
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

// ── Keyword fallback responses ─────────────────────────────────────────────────
function fallback(msg) {
  const m = (msg || '').toLowerCase();

  if (m.includes('habari') || m.includes('mambo') || m.includes('hujambo') || m.includes('nisaidie')) {
    return 'Habari! Mimi ni **KenyaWatch AI** 👋\n\nNinaweza kukusaidia:\n- Kuripoti ufisadi kwa usalama\n- Kuangalia mikataba ya serikali\n- Kupata taarifa za miradi ya bandia\n\n**EACC: 0800 720 880** (bure)';
  }
  if (m.includes('report') || m.includes('ripoti') || m.includes('corrupt') || m.includes('bribe') || m.includes('rushwa')) {
    return 'To report corruption safely:\n\n1. Click **🚨 Report** in the navigation menu\n2. Your identity is **never stored or shared**\n3. AI scores your report and routes it to **EACC, DPP, or PPRA**\n4. You get a case number to track progress\n\n**EACC Hotline: 0800 720 880** (free, 24/7)';
  }
  if (m.includes('contract') || m.includes('tender') || m.includes('procure')) {
    return 'To check a government contract:\n\n1. Go to **📋 Procurement** in the menu\n2. Click **+ Scan Contract**\n3. AI analyses it for fraud signals and gives a **risk score 0–100**\n\nYou can also filter contracts by county, sector, or risk level.';
  }
  if (m.includes('ghost') || m.includes('satellite') || m.includes('school') || m.includes('hospital') || m.includes('road')) {
    return 'The **Ghost Project Detector** uses Sentinel-2 satellite imagery to verify construction:\n\n- 🔴 **GHOST** — Paid for but never built\n- 🟡 **PARTIAL** — Incomplete despite full payment\n- 🟢 **VERIFIED** — Confirmed built\n\nSee all detections in **👻 Ghost Projects**.';
  }
  if (m.includes('eacc') || m.includes('dpp') || m.includes('ppra') || m.includes('contact')) {
    return '**Anti-Corruption Contacts:**\n\n📞 **EACC:** 0800 720 880 (free, 24/7)\n🌐 eacc.go.ke\n\n📧 **DPP:** corruption@dpp.go.ke\n\n🌐 **PPRA:** ppra.go.ke\n\n**Report anonymously** via this platform anytime.';
  }
  if (m.includes('hello') || m.includes('hi') || m.includes('hey') || m.includes('help') || m.includes('start')) {
    return 'Hello! I\'m **KenyaWatch AI** 👋\n\nI can help you:\n- **Report corruption** anonymously\n- **Scan contracts** for fraud signals\n- **Track ghost projects** via satellite\n- **Connect you** to EACC, DPP, or PPRA\n\nWhat would you like to do?';
  }

  return 'I\'m **KenyaWatch AI**, here to help fight corruption in Kenya.\n\nAsk me about reporting corruption, checking contracts, or ghost projects.\n\n**EACC: 0800 720 880** (free, 24/7)';
}

// ── Session memory ─────────────────────────────────────────────────────────────
const sessions = new Map();
const MAX_TURNS = 8;

function getSession(id) { return sessions.get(id) || []; }
function saveSession(id, msgs) {
  sessions.set(id, msgs.slice(-(MAX_TURNS * 2)));
}

// ── POST /api/chatbot/message ─────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  const { message, session_id } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  const sid     = (session_id || 'default').toString().slice(0, 80);
  const userMsg = message.trim().slice(0, 1000);

  // Try Gemini first
  try {
    const history = getSession(sid);
    history.push({ role: 'user', parts: [{ text: userMsg }] });

    const reply = await callGemini(history);

    history.push({ role: 'model', parts: [{ text: reply }] });
    saveSession(sid, history);

    return res.json({ success: true, reply, fallback: false, session_id: sid });

  } catch (e) {
    // Use keyword fallback if Gemini unavailable
    const reply = fallback(userMsg);
    return res.json({ success: true, reply, fallback: true, session_id: sid });
  }
});

// ── GET /api/chatbot/status ────────────────────────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({
    success:  true,
    ai_ready: !!process.env.GEMINI_API_KEY,
    provider: 'Google Gemini',
    model:    GEMINI_MODEL,
    sessions: sessions.size,
  });
});

// ── GET /api/chatbot/history/:id ──────────────────────────────────────────────
router.get('/history/:id', (req, res) => {
  res.json({ success: true, data: getSession(req.params.id) });
});

// ── DELETE /api/chatbot/history/:id ──────────────────────────────────────────
router.delete('/history/:id', (req, res) => {
  sessions.delete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
