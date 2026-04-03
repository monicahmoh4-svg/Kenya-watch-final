const router = require('express').Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ghost_projects ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/meta/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE detection_status='ghost') AS ghost_count,
        COUNT(*) FILTER (WHERE detection_status='partial') AS partial_count,
        COUNT(*) FILTER (WHERE detection_status='verified') AS verified_count,
        COALESCE(SUM(amount_at_risk) FILTER (WHERE detection_status IN ('ghost','partial')),0) AS total_at_risk
      FROM ghost_projects
    `);
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
