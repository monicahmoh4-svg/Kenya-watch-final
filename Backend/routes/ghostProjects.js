'use strict';
const router = require('express').Router();
const { pool } = require('../db');
const { analyzeSatellite } = require('../models/satelliteAnalyzer');
const { paginate, paginationMeta, safeJSON, buildWhereClause } = require('../utils/helpers');

// GET /api/ghost-projects
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);
    const { where, values } = buildWhereClause(req.query);
    const [data, count] = await Promise.all([
      pool.query(`SELECT * FROM ghost_projects ${where} ORDER BY confidence_score DESC, created_at DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM ghost_projects ${where}`, values),
    ]);
    res.json({
      success: true,
      data: data.rows.map(r => ({ ...r, satellite_metadata: safeJSON(r.satellite_metadata) })),
      meta: paginationMeta(count.rows[0].count, page, limit),
    });
  } catch (err) { next(err); }
});

// GET /api/ghost-projects/analytics
router.get('/analytics', async (req, res, next) => {
  try {
    const [status, county, sector, funds] = await Promise.all([
      pool.query(`SELECT detection_status, COUNT(*) AS count, SUM(amount_at_risk) AS total_at_risk FROM ghost_projects GROUP BY detection_status`),
      pool.query(`SELECT county, COUNT(*) AS count, SUM(amount_at_risk) AS total_at_risk FROM ghost_projects GROUP BY county ORDER BY total_at_risk DESC LIMIT 15`),
      pool.query(`SELECT sector, COUNT(*) AS count, SUM(amount_at_risk) AS total_at_risk FROM ghost_projects WHERE sector IS NOT NULL GROUP BY sector ORDER BY total_at_risk DESC`),
      pool.query(`SELECT SUM(amount_at_risk) FILTER (WHERE detection_status='ghost') AS confirmed_ghost, SUM(amount_at_risk) FILTER (WHERE detection_status='partial') AS partial_built, COUNT(*) AS total FROM ghost_projects`),
    ]);
    res.json({
      success: true,
      data: {
        by_status: status.rows,
        by_county: county.rows,
        by_sector: sector.rows,
        fund_summary: funds.rows[0],
      },
    });
  } catch (err) { next(err); }
});

// GET /api/ghost-projects/:id — single + re-run satellite analysis
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ghost_projects WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Ghost project not found' });
    const gp = { ...rows[0], satellite_metadata: safeJSON(rows[0].satellite_metadata) };
    res.json({ success: true, data: gp });
  } catch (err) { next(err); }
});

// POST /api/ghost-projects — create with auto satellite analysis
router.post('/', async (req, res, next) => {
  try {
    const { contract_ref, project_name, county, sector, gps_coordinates, claimed_status, amount_at_risk, procuring_entity } = req.body;
    if (!project_name) return res.status(400).json({ success: false, error: 'project_name is required' });

    const analysis = analyzeSatellite({ project_name, sector, county, amount_at_risk: parseInt(amount_at_risk)||0, claimed_status });

    const { rows } = await pool.query(
      `INSERT INTO ghost_projects (contract_ref,project_name,county,sector,gps_coordinates,claimed_status,satellite_status,satellite_date,amount_at_risk,detection_status,confidence_score,procuring_entity,satellite_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [contract_ref||null, project_name, county||null, sector||null, gps_coordinates||null,
       claimed_status||null, analysis.satellite_status, analysis.satellite_date,
       parseInt(amount_at_risk)||0, analysis.detection_status, analysis.confidence_score,
       procuring_entity||null, JSON.stringify(analysis.satellite_metadata)]
    );
    res.status(201).json({ success: true, data: { ...rows[0], satellite_metadata: analysis.satellite_metadata } });
  } catch (err) { next(err); }
});

// PUT /api/ghost-projects/:id — update and re-analyse
router.put('/:id', async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query('SELECT * FROM ghost_projects WHERE id=$1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Ghost project not found' });
    const gp = existing[0];
    const merged = {
      project_name: req.body.project_name || gp.project_name,
      county: req.body.county || gp.county,
      sector: req.body.sector || gp.sector,
      claimed_status: req.body.claimed_status || gp.claimed_status,
      amount_at_risk: req.body.amount_at_risk ? parseInt(req.body.amount_at_risk) : gp.amount_at_risk,
    };
    const analysis = analyzeSatellite(merged);
    const { rows } = await pool.query(
      `UPDATE ghost_projects SET project_name=$1,county=$2,sector=$3,claimed_status=$4,amount_at_risk=$5,satellite_status=$6,satellite_date=$7,detection_status=$8,confidence_score=$9,satellite_metadata=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [merged.project_name, merged.county, merged.sector, merged.claimed_status, merged.amount_at_risk,
       analysis.satellite_status, analysis.satellite_date, analysis.detection_status, analysis.confidence_score,
       JSON.stringify(analysis.satellite_metadata), gp.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/ghost-projects/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM ghost_projects WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Ghost project not found' });
    res.json({ success: true, message: 'Ghost project deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
