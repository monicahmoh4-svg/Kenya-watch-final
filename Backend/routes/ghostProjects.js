const router = require('express').Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ghost_projects ORDER BY created_at DESC'
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST — add new ghost project (used by admin panel)
router.post('/', async (req, res) => {
  const { contract_ref, project_name, county, claimed_status,
          satellite_status, amount_at_risk, detection_status } = req.body;
  if (!project_name)
    return res.status(400).json({ success: false, error: 'project_name is required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO ghost_projects
         (contract_ref, project_name, county, claimed_status, satellite_status, amount_at_risk, detection_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [contract_ref||null, project_name, county||null, claimed_status||null,
       satellite_status||null, amount_at_risk ? parseInt(amount_at_risk) : 0,
       detection_status||'flagged']
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/meta/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE detection_status = 'ghost')    AS ghost_count,
        COUNT(*) FILTER (WHERE detection_status = 'partial')  AS partial_count,
        COUNT(*) FILTER (WHERE detection_status = 'verified') AS verified_count,
        COALESCE(SUM(amount_at_risk) FILTER (
          WHERE detection_status IN ('ghost','partial')
        ), 0) AS total_at_risk
      FROM ghost_projects
    `);
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
