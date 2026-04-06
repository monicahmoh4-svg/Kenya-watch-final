'use strict';
const router = require('express').Router();
const https  = require('https');
const { pool } = require('../db');

function safeJSON(v) { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } }

const SYSTEM = `You are KenyaWatch AI, Kenya's anti-corruption intelligence assistant with live database access.

Key Kenya anti-corruption contacts:
- EACC toll-free: 1551 | Mobile: 0727 285663 / 0733 520641 | Landline: (020) 2717468
- DPP: corruption@dpp.go.ke | PPRA: ppra.go.ke

Expertise: Kenya PPADA 2015 (amended 2025), EACC Act, County Governments Act, KRA compliance, World Bank/AFDB procurement standards.

Rules: concise (≤250 words unless deep analysis requested), use **bold** for key entities/figures, cite specific contract IDs from context, end with one clear actionable recommendation. Respond in user's language.`;

async function getDBContext() {
  try {
    const [stats, high, reports, ghosts] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE risk_level='HIGH') AS high_risk, COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS flagged FROM contracts`),
      pool.query(`SELECT contract_id,description,county,value,supplier,risk_score,flags FROM contracts WHERE risk_level='HIGH' ORDER BY risk_score DESC LIMIT 6`),
      pool.query(`SELECT case_number,type,county,status,ai_credibility_score FROM reports ORDER BY created_at DESC LIMIT 5`),
      pool.query(`SELECT project_name,county,detection_status,amount_at_risk,confidence_score FROM ghost_projects WHERE detection_status IN ('ghost','partial') LIMIT 5`),
    ]);
    const s = stats.rows[0];
    return `=== LIVE DATABASE ===
Stats: ${s.total} contracts, ${s.high_risk} HIGH RISK, KES ${(s.flagged / 1e9).toFixed(2)}B flagged

HIGH-RISK CONTRACTS:
${high.rows.map(c => `• ${c.contract_id} | ${c.description} | ${c.county} | KES ${(c.value / 1e6).toFixed(0)}M | Score:${c.risk_score} | ${safeJSON(c.flags).slice(0, 2).join('; ')}`).join('\n')}

RECENT REPORTS:
${reports.rows.map(r => `• ${r.case_number} | ${r.type} | ${r.county || 'N/A'} | ${r.status} | Credibility:${r.ai_credibility_score}`).join('\n')}

GHOST PROJECTS:
${ghosts.rows.map(g => `• ${g.project_name} | ${g.county} | ${g.detection_status.toUpperCase()} | KES ${(g.amount_at_risk / 1e6).toFixed(0)}M | Confidence:${g.confidence_score}%`).join('\n')}
====================`;
  } catch {
    return '=== DB context unavailable ===';
  }
}

function callClaude(messages, systemWithCtx) {
  return new Promise(resolve => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return resolve({ ok: false, text: getAIFallback(messages[messages.length - 1]?.content || '') });

    const body = JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, system: systemWithCtx, messages });
    const opts = {
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }
    };

    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return resolve({ ok: false, text: getAIFallback('', p.error.message) });
          resolve({ ok: true, text: p.content?.map(b => b.text || '').join('') || '' });
        } catch { resolve({ ok: false, text: getAIFallback('') }); }
      });
    });

    req.on('error', err => {
      console.error('Claude API error:', err.message);
      resolve({ ok: false, text: getAIFallback('') });
    });
    req.setTimeout(25000, () => { req.destroy(); resolve({ ok: false, text: getAIFallback('') }); });
    req.write(body);
    req.end();
  });
}

function getAIFallback(msg, errMsg = '') {
  if (errMsg && (errMsg.includes('401') || errMsg.includes('API key'))) {
    return '⚠️ AI service needs configuration. Administrator: please add **ANTHROPIC_API_KEY** in Railway → Variables tab.\n\nFor immediate corruption reporting:\n**EACC: 1551** (toll-free) | **0727 285663** | **(020) 2717468**';
  }
  const m = (msg || '').toLowerCase();
  if (m.includes('contract') || m.includes('procurement')) {
    return 'Use **📋 Procurement Scanner** to analyse contracts. Navigate to the Procurement tab and click **+ Scan Contract** to get an AI risk score (0-100) with specific fraud flags.\n\n**EACC: 1551** to report suspicious contracts.';
  }
  if (m.includes('report') || m.includes('bribe')) {
    return 'To report corruption:\n\n1. Click **🚨 Report** in the navigation\n2. Fill in details anonymously — identity never stored\n3. AI routes to **EACC, DPP, or PPRA**\n\n**EACC Toll-Free: 1551** (24/7, free)\nAlternative: **0727 285663** | **(020) 2717468**';
  }
  if (m.includes('eacc') || m.includes('contact')) {
    return '**EACC Contacts:**\n\n• Toll-free: **1551**\n• Mobile: **0727 285663** or **0733 520641**\n• Landline: **(020) 2717468**\n• eacc.go.ke\n\n**DPP:** corruption@dpp.go.ke\n**PPRA:** ppra.go.ke';
  }
  return 'I\'m **KenyaWatch AI** — your anti-corruption assistant for Kenya. Ask about contracts, corruption patterns, or ghost projects.\n\n**EACC: 1551** (toll-free) | **0727 285663**';
}

// Session store
const sessions = new Map();
function getHist(sid) { return sessions.get(sid) || []; }
function addHist(sid, role, content) {
  const h = getHist(sid); h.push({ role, content });
  while (h.length > 20) h.shift();
  sessions.set(sid, h);
}

router.post('/chat', async (req, res) => {
  try {
    const { message, session_id } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'message required' });
    const sid = session_id || 'default';
    const msg = message.trim().slice(0, 1000);
    addHist(sid, 'user', msg);
    const dbCtx = await getDBContext();
    const { ok, text } = await callClaude(getHist(sid), SYSTEM + '\n\n' + dbCtx);
    addHist(sid, 'assistant', text);
    if (session_id) pool.query('INSERT INTO chat_logs (session_id,role,content) VALUES ($1,$2,$3)', [sid, 'assistant', text]).catch(() => {});
    res.json({ success: true, reply: text, fallback: !ok, session_id: sid });
  } catch (e) {
    console.error('AI chat error:', e.message);
    res.json({ success: true, reply: getAIFallback(req.body?.message || ''), fallback: true });
  }
});

router.post('/analyse-contract', async (req, res) => {
  try {
    const { contract_id } = req.body;
    if (!contract_id) return res.status(400).json({ success: false, error: 'contract_id required' });
    const { rows } = await pool.query('SELECT * FROM contracts WHERE contract_id=$1 OR id::text=$1', [contract_id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Contract not found' });
    const c = { ...rows[0], flags: safeJSON(rows[0].flags) };
    const dbCtx = await getDBContext();
    const prompt = `Deep analysis of contract ${c.contract_id}: ${c.description} | ${c.county} | KES ${(c.value / 1e6).toFixed(1)}M | Supplier: ${c.supplier} | Bid: ${c.bid_type} | Risk: ${c.risk_score}/100 (${c.risk_level}) | Flags: ${c.flags.join('; ')}. Provide: 1) Risk summary 2) Key concerns 3) Recommended action`;
    const { ok, text } = await callClaude([{ role: 'user', content: prompt }], SYSTEM + '\n\n' + dbCtx);
    res.json({ success: true, data: c, analysis: text, fallback: !ok });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/history/:session_id', (req, res) => {
  res.json({ success: true, data: getHist(req.params.session_id) });
});

router.delete('/history/:session_id', (req, res) => {
  sessions.delete(req.params.session_id);
  res.json({ success: true, message: 'Cleared' });
});

router.get('/status', (req, res) => {
  res.json({ success: true, ai_enabled: !!process.env.ANTHROPIC_API_KEY, sessions: sessions.size });
});

module.exports = router;
