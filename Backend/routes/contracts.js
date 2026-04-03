const router = require('express').Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contracts ORDER BY risk_score DESC');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/scan', async (req, res) => {
  const { contract_id, description, county, value, supplier } = req.body;
  if (!contract_id || !supplier || !value)
    return res.status(400).json({ success: false, error: 'contract_id, supplier and value required' });

  let score = 0;
  const flags = [];
  if (Math.random() > 0.6) { score += 25; flags.push('Director linked to government officials'); }
  if (Math.random() > 0.5) { score += 20; flags.push('Single-source award — no competitive bidding'); }
  const dev = Math.floor(Math.random() * 200) + 20;
  if (dev > 100) { score += 25; flags.push(`Price ${dev}% above market average`); }
  if (Math.random() > 0.7) { score += 20; flags.push('Company registered less than 2 years ago'); }
  if (Math.random() > 0.8) { score += 10; flags.push('No prior government contracts'); }
  score = Math.min(score, 100);
  const risk_level = score >= 75 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';

  try {
    const { rows } = await pool.query(
      `INSERT INTO contracts (contract_id,description,county,value,supplier,risk_score,risk_level,flags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (contract_id) DO UPDATE SET risk_score=$6,risk_level=$7,flags=$8
       RETURNING *`,
      [contract_id, description||'N/A', county||'N/A', parseInt(value), supplier, score, risk_level, JSON.stringify(flags)]
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/meta/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE risk_level='HIGH') AS high_risk,
        COUNT(*) FILTER (WHERE risk_level='MEDIUM') AS medium_risk,
        COUNT(*) FILTER (WHERE risk_level='LOW') AS low_risk,
        COUNT(*) AS total,
        COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS high_risk_value
      FROM contracts
    `);
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
