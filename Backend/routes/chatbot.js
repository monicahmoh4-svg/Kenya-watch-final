'use strict';
const router = require('express').Router();
const https  = require('https');

// ── Correct EACC contact details ──────────────────────────────────────────────
const EACC_CONTACTS = `EACC (Ethics & Anti-Corruption Commission):
- Toll-free hotline: **1551**
- Mobile: 0727 285663 or 0733 520641
- Landline: (020) 2717468
- Website: eacc.go.ke`;

const SYSTEM = `You are KenyaWatch AI, Kenya's anti-corruption intelligence assistant embedded in the KenyaWatch platform.

Help users: report corruption, understand procurement fraud, track ghost projects, connect to EACC/DPP/PPRA.

Key Kenya anti-corruption contacts:
- EACC toll-free: 1551 | Mobile: 0727 285663 / 0733 520641 | Landline: (020) 2717468
- DPP: corruption@dpp.go.ke
- PPRA: ppra.go.ke

Rules:
- Be concise (under 200 words), warm and professional
- Use **bold** for key names, numbers, entities
- Always end with one clear action step
- Respond in user's language (English or Kiswahili)
- For any corruption report: always give EACC 1551 as primary contact`;

// ── Call Claude API via raw https ─────────────────────────────────────────────
function callAI(messages) {
  return new Promise(resolve => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return resolve({ ok: false, text: getFallback(messages[messages.length - 1]?.content || '') });

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM,
      messages
    });

    const opts = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return resolve({ ok: false, text: getFallback('', p.error.message) });
          const text = p.content?.map(b => b.text || '').join('') || '';
          resolve({ ok: true, text });
        } catch {
          resolve({ ok: false, text: getFallback('') });
        }
      });
    });

    req.on('error', err => {
      console.error('Claude API error:', err.message);
      resolve({ ok: false, text: getFallback('') });
    });

    req.setTimeout(25000, () => {
      req.destroy();
      resolve({ ok: false, text: getFallback('') });
    });

    req.write(body);
    req.end();
  });
}

// ── Smart fallbacks — never shows raw error to user ──────────────────────────
function getFallback(msg, errMsg = '') {
  if (errMsg && (errMsg.includes('401') || errMsg.includes('API key') || errMsg.includes('authentication'))) {
    return 'The AI assistant requires an API key. Please ask the administrator to configure **ANTHROPIC_API_KEY** in the Railway environment variables.\n\nYou can still report corruption directly:\n\n**EACC: 1551** (toll-free) | 0727 285663 | (020) 2717468';
  }

  const m = (msg || '').toLowerCase();

  if (m.includes('report') || m.includes('bribe') || m.includes('corruption') || m.includes('ripoti')) {
    return `To report corruption anonymously:\n\n1. Click **🚨 Report** in the navigation menu\n2. Fill in the details — your identity is **never stored**\n3. AI scores your report and routes it to the right authority\n\n**EACC Toll-Free: 1551** (free, 24/7)\nAlternative: **0727 285663** | **(020) 2717468**`;
  }
  if (m.includes('contract') || m.includes('procurement') || m.includes('tender')) {
    return 'To analyse a government contract:\n\nGo to **📋 Procurement** in the menu → click **+ Scan Contract**\n\nAI scores risk 0-100. Score **≥75 = HIGH RISK** — automatically escalated to EACC.';
  }
  if (m.includes('ghost') || m.includes('satellite') || m.includes('project')) {
    return '**Ghost Project Detector** uses Sentinel-2 satellite imagery:\n\n• **GHOST** — No structure built despite payment\n• **PARTIAL** — Incomplete despite full payment claimed\n• **VERIFIED** — Construction confirmed\n\nCheck the **👻 Ghost Projects** tab.';
  }
  if (m.includes('eacc') || m.includes('contact') || m.includes('phone') || m.includes('number') || m.includes('hotline')) {
    return `**Kenya Anti-Corruption Contacts:**\n\n🏛 **EACC** — Ethics & Anti-Corruption Commission\n• Toll-free: **1551**\n• Mobile: **0727 285663** or **0733 520641**\n• Landline: **(020) 2717468**\n• eacc.go.ke\n\n⚖️ **DPP** — Director of Public Prosecutions\n• corruption@dpp.go.ke\n\n📋 **PPRA** — Procurement Regulatory Authority\n• ppra.go.ke`;
  }
  if (m.includes('hello') || m.includes('hi') || m.includes('habari') || m.includes('hujambo') || m.includes('help')) {
    return '**Habari! I\'m KenyaWatch AI** 👋\n\nI\'m your anti-corruption intelligence assistant for Kenya.\n\nI can help you:\n• Report corruption **anonymously and safely**\n• Analyse government contracts for fraud\n• Track ghost infrastructure projects\n• Connect you to **EACC, DPP, PPRA**\n\nWhat would you like to do?';
  }
  if (m.includes('nimbo') || m.includes('salamu') || m.includes('karibu')) {
    return '**Karibu KenyaWatch AI!** 👋\n\nMimi ni msaidizi wako wa kupambana na ufisadi Kenya.\n\nNinaweza kukusaidia:\n• Kuripoti ufisadi kwa usalama\n• Kuchanganua mikataba ya serikali\n• Kupata miradi ya bandia\n• Kuwasiliana na **EACC: 1551**\n\nNiulize chochote!';
  }

  // Generic helpful fallback — never shows an error
  return 'I\'m **KenyaWatch AI**, your Kenya anti-corruption assistant.\n\nAsk me about reporting corruption, contract fraud analysis, or ghost project detection.\n\n**EACC Hotline: 1551** (toll-free, 24/7)\nAlternative: **0727 285663** | **(020) 2717468**';
}

// ── Session store ─────────────────────────────────────────────────────────────
const sessions = new Map();
function getH(sid) { return sessions.get(sid) || []; }
function addH(sid, role, content) {
  const h = getH(sid);
  h.push({ role, content });
  while (h.length > 16) h.shift();
  sessions.set(sid, h);
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { message, session_id } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'message required' });
    const sid = session_id || 'anon';
    const msg = message.trim().slice(0, 800);
    addH(sid, 'user', msg);
    const { ok, text } = await callAI(getH(sid));
    addH(sid, 'assistant', text);
    res.json({ success: true, reply: text, fallback: !ok, session_id: sid });
  } catch (e) {
    console.error('Chatbot route error:', e.message);
    res.json({ success: true, reply: getFallback(req.body?.message || ''), fallback: true });
  }
});

router.get('/history/:sid', (req, res) => {
  res.json({ success: true, data: getH(req.params.sid) });
});

router.delete('/history/:sid', (req, res) => {
  sessions.delete(req.params.sid);
  res.json({ success: true });
});

router.get('/status', (req, res) => {
  res.json({ success: true, ai_enabled: !!process.env.ANTHROPIC_API_KEY, sessions: sessions.size });
});

module.exports = router;
