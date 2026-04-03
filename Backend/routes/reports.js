const router = require('express').Router();
const { pool } = require('../db');

router.post('/', async (req, res) => {
  const { type, county, sector, description, amount, anonymous } = req.body;
  if (!type || !description)
    return res.status(400).json({ success: false, error: 'type and description are required' });

  const case_number = `KW-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;
  let score = 50;
  if (description.length > 200) score += 15;
  if (amount > 0) score += 15;
  if (county) score += 10;
  if (sector) score += 10;
  score = Math.min(score, 100);

  try {
    const { rows } = await pool.query(
      `INSERT INTO reports (case_number,type,county,sector,description,amount,anonymous,ai_credibility_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,case_number,status,created_at`,
      [case_number, type, county||null, sector||null, description, amount ? parseInt(amount) : null, anonymous !== false, score]
    );
    res.json({ success: true, data: { ...rows[0], ai_credibility_score: score } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,case_number,type,county,sector,status,ai_credibility_score,created_at
       FROM reports ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/meta/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='pending') AS pending,
        COUNT(*) FILTER (WHERE status='resolved') AS resolved,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days
      FROM reports
    `);
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
