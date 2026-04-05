'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// KenyaWatch AI Chatbot Route
// Drop this file into Backend/routes/chatbot.js
// Then in server.js add:  app.use('/api/chatbot', require('./routes/chatbot'));
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const https  = require('https');

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM = `You are KenyaWatch AI, Kenya's premier anti-corruption intelligence assistant.

You are embedded in the KenyaWatch AI platform which monitors:
- Government procurement contracts across all 47 Kenya counties
- Ghost infrastructure projects detected via satellite imagery
- Anonymous citizen corruption reports

Your knowledge includes:
- Kenya's Public Procurement and Asset Disposal Act (2015, amended 2025)
- Ethics and Anti-Corruption Commission (EACC) — hotline: 0800 720 880
- Director of Public Prosecutions (DPP) — corruption@dpp.go.ke
- Public Procurement Regulatory Authority (PPRA) — ppra.go.ke
- County Governments Act and devolved procurement rules
- Kenya Revenue Authority supplier compliance
- World Bank, AFDB, EU procurement standards in Kenya

Behaviour rules:
- Be concise (under 200 words unless asked for detail)
- Use **bold** for key names, figures, and entities
- Always end with one clear action the user can take
- For corruption reports: always mention EACC 0800 720 880
- Be warm, professional, and Kenya-specific
- Respond in the same language the user writes in (English or Kiswahili)`;

// ── Call Anthropic API directly via https (no SDK needed) ─────────────────────
function callClaude(messages, systemPrompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return resolve({ fallback: true, content: getFallbackResponse(messages[messages.length - 1]?.content || '') });
    }

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,
      messages,
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return resolve({ fallback: true, content: getFallbackResponse('', parsed.error.message) });
          }
          const text = parsed.content?.map(b => b.text || '').join('') || '';
          resolve({ fallback: false, content: text });
        } catch {
          resolve({ fallback: true, content: getFallbackResponse('') });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ fallback: true, content: getFallbackResponse('', err.message) });
    });

    req.setTimeout(25000, () => {
      req.destroy();
      resolve({ fallback: true, content: 'Request timed out. Please try again.' });
    });

    req.write(body);
    req.end();
  });
}

// ── Fallback responses when API is unavailable ────────────────────────────────
function getFallbackResponse(message, errorMsg = '') {
  const msg = (message || '').toLowerCase();

  if (errorMsg.includes('API key') || errorMsg.includes('401')) {
    return 'The AI assistant needs an API key to work. Please ask the administrator to add **ANTHROPIC_API_KEY** in the Railway environment variables.';
  }

  // Keyword-based fallbacks
  if (msg.includes('report') || msg.includes('corruption') || msg.includes('bribe') || msg.includes('ripoti')) {
    return 'To report corruption anonymously:\n\n1. Click **"Report"** in the navigation menu\n2. Fill in the form — your identity is **never stored**\n3. AI will score your report and route it to **EACC, DPP, or PPRA**\n4. You\'ll receive a case number to track progress\n\n**EACC Hotline: 0800 720 880** (free, 24/7)';
  }
  if (msg.includes('contract') || msg.includes('procurement') || msg.includes('tender')) {
    return 'Use the **Procurement Scanner** to check any government contract:\n\n- Navigate to **📋 Procurement** in the menu\n- Click **+ Scan Contract** to analyse any tender\n- AI scores risk **0-100** and flags: inflated prices, shell companies, single-source awards\n\n**High Risk (75-100)** contracts are automatically escalated to EACC.';
  }
  if (msg.includes('ghost') || msg.includes('satellite') || msg.includes('project') || msg.includes('school') || msg.includes('hospital') || msg.includes('road')) {
    return 'The **Ghost Project Detector** uses satellite imagery to verify infrastructure:\n\n- **GHOST** — No structure found on satellite\n- **PARTIAL** — Incomplete despite full payment claimed\n- **VERIFIED** — Construction confirmed\n\nNavigate to **👻 Ghost Projects** to see all detections. Evidence is auto-sent to EACC.';
  }
  if (msg.includes('eacc') || msg.includes('dpp') || msg.includes('ppra') || msg.includes('contact') || msg.includes('who')) {
    return '**Kenya Anti-Corruption Contacts:**\n\n- **EACC** — Ethics & Anti-Corruption Commission\n  📞 0800 720 880 (free)\n  🌐 eacc.go.ke\n\n- **DPP** — Director of Public Prosecutions\n  📧 corruption@dpp.go.ke\n\n- **PPRA** — Procurement Regulatory Authority\n  🌐 ppra.go.ke\n\nAll are reachable from the **AI Investigator** tab.';
  }
  if (msg.includes('habari') || msg.includes('hujambo') || msg.includes('mambo')) {
    return 'Habari! Mimi ni **KenyaWatch AI** — msaidizi wako wa kupambana na ufisadi Kenya.\n\nNaweza kukusaidia:\n- Kuripoti ufisadi kwa usalama\n- Kuangalia mikataba ya serikali\n- Kupata habari za miradi ya bandia\n\nNiulize chochote!';
  }
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('help') || msg.includes('start') || msg.includes('hey')) {
    return 'Hello! I\'m **KenyaWatch AI** 👋\n\nI can help you:\n- **Report corruption** anonymously and safely\n- **Analyse government contracts** for fraud signals\n- **Track ghost projects** detected by satellite\n- **Connect you** to EACC, DPP, or PPRA\n\nWhat would you like to do?';
  }
  if (msg.includes('how') || msg.includes('what') || msg.includes('explain')) {
    return 'KenyaWatch AI uses **three pillars** to fight corruption:\n\n1. **AI Procurement Scanner** — Scores every contract 0-100 for fraud risk\n2. **Satellite Ghost Detector** — Verifies infrastructure actually exists\n3. **Citizen Reporting** — Anonymous, encrypted, AI-routed reports\n\nAll data feeds into a real-time dashboard. Ask me anything specific!';
  }

  return 'I\'m **KenyaWatch AI**, here to help fight corruption in Kenya.\n\nI can help you report corruption, analyse contracts, or explain how the platform works.\n\nWhat would you like to know? You can also call **EACC directly: 0800 720 880**';
}

// ── In-memory session store (resets on server restart — use Redis for production) ─
const sessions = new Map();
const MAX_HISTORY = 10; // keep last 10 messages per session

function getHistory(sessionId) {
  return sessions.get(sessionId) || [];
}

function addToHistory(sessionId, role, content) {
  const history = getHistory(sessionId);
  history.push({ role, content });
  // Keep only last MAX_HISTORY messages
  while (history.length > MAX_HISTORY * 2) history.shift();
  sessions.set(sessionId, history);
}

// ── POST /api/chatbot/message ─────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { message, session_id } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const sid = session_id || 'default';
    const userMsg = message.trim().slice(0, 1000); // cap at 1000 chars

    // Get conversation history
    addToHistory(sid, 'user', userMsg);
    const history = getHistory(sid);

    // Call Claude with full history
    const { fallback, content } = await callClaude(history, SYSTEM);

    // Store AI response
    addToHistory(sid, 'assistant', content);

    res.json({
      success: true,
      reply: content,
      fallback,
      session_id: sid,
    });

  } catch (err) {
    console.error('Chatbot error:', err.message);
    res.json({
      success: true,
      reply: getFallbackResponse(req.body?.message || ''),
      fallback: true,
    });
  }
});

// ── GET /api/chatbot/history/:session_id ──────────────────────────────────────
router.get('/history/:session_id', (req, res) => {
  const history = getHistory(req.params.session_id);
  res.json({ success: true, data: history });
});

// ── DELETE /api/chatbot/history/:session_id ───────────────────────────────────
router.delete('/history/:session_id', (req, res) => {
  sessions.delete(req.params.session_id);
  res.json({ success: true, message: 'Conversation cleared' });
});

// ── GET /api/chatbot/status ───────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    success: true,
    ai_enabled: !!process.env.ANTHROPIC_API_KEY,
    sessions_active: sessions.size,
    model: 'claude-sonnet-4-20250514',
  });
});

module.exports = router;
