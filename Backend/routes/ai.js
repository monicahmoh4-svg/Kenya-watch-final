const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are KenyaWatch AI, an expert anti-corruption intelligence assistant for Kenya.
You help users understand procurement fraud, ghost projects, corruption patterns, and what actions to take.
Be concise, factual, and Kenya-specific. Use **bold** for key figures.
Always end with a clear practical action step. Keep responses under 250 words.`;

router.post('/chat', async (req, res) => {
  const { message, session_id } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'message is required' });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: 'user', content: message }]
    });
    const reply = response.content.map(b => b.text || '').join('');
    if (session_id) {
      pool.query('INSERT INTO chat_logs (session_id,role,content) VALUES ($1,$2,$3)', [session_id, 'assistant', reply]).catch(() => {});
    }
    res.json({ success: true, reply });
  } catch (e) {
    console.error('AI error:', e.message);
    res.status(500).json({ success: false, error: 'AI service temporarily unavailable' });
  }
});

module.exports = router;
