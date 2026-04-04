'use strict';

const router = require('express').Router();
const { pool } = require('../db');
const { analyseProject, generateStats } = require('../models/satelliteAnalyzer');
const { validateGhostProject, validateStatusUpdate } = require('../utils/validators');
const { successResponse, errorResponse } = require('../utils/helpers');

const ALLOWED_STATUSES = ['ghost', 'partial', 'verified', 'flagged', 'investigating'];

// ── GET /api/ghost-projects — list all ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, county, page = 1, limit = 100 } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (status) { conditions.push(`detection_status = $${idx++}`); values.push(status); }
    if (county) { conditions.push(`county = $${idx++}`);           values.push(county); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const p = Math.max(1, parseInt(page));
    const l = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (p - 1) * l;

    const countRes = await pool.query(`SELECT COUNT(*) FROM ghost_projects ${where}`, values);
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(
      `SELECT * FROM ghost_projects ${where}
       ORDER BY CASE detection_status WHEN 'ghost' THEN 1 WHEN 'partial' THEN 2 WHEN 'investigating' THEN 3 WHEN 'flagged' THEN 4 ELSE 5 END,
                amount_at_risk DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, l, offset]
    );

    successResponse(res, rows, {
      meta: { total, page: p, limit: l, pages: Math.ceil(total / l) }
    });
  } catch (e) {
    console.error('GET /ghost-projects error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve ghost projects', 'DB_ERROR');
  }
});

// ── GET /api/ghost-projects/analytics — detection statistics ─────────────────
router.get('/analytics', async (req, res) => {
  try {
    const [stats, byCounty, byStatus, totals] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE detection_status = 'ghost')        AS ghost_count,
          COUNT(*) FILTER (WHERE detection_status = 'partial')      AS partial_count,
          COUNT(*) FILTER (WHERE detection_status = 'verified')     AS verified_count,
          COUNT(*) FILTER (WHERE detection_status = 'investigating') AS investigating_count,
          COUNT(*) FILTER (WHERE detection_status = 'flagged')      AS flagged_count,
          COALESCE(SUM(amount_at_risk) FILTER (WHERE detection_status IN ('ghost','partial')), 0) AS total_at_risk,
          COALESCE(SUM(amount_at_risk) FILTER (WHERE detection_status = 'ghost'), 0) AS ghost_value,
          COALESCE(SUM(amount_at_risk) FILTER (WHERE detection_status = 'partial'), 0) AS partial_value
        FROM ghost_projects
      `),
      pool.query(`
        SELECT county,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE detection_status = 'ghost') AS ghost_count,
               COALESCE(SUM(amount_at_risk), 0) AS total_at_risk
        FROM ghost_projects
        WHERE county IS NOT NULL
        GROUP BY county
        ORDER BY ghost_count DESC, total_at_risk DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT detection_status, COUNT(*) AS count,
               COALESCE(SUM(amount_at_risk), 0) AS total_value
        FROM ghost_projects
        GROUP BY detection_status
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE detection_status IN ('ghost','partial')) AS active_flags,
          COALESCE(SUM(amount_at_risk), 0) AS total_funds_at_risk
        FROM ghost_projects
      `)
    ]);

    successResponse(res, {
      summary: { ...stats.rows[0], ...totals.rows[0] },
      by_county: byCounty.rows,
      by_status: byStatus.rows
    });
  } catch (e) {
    console.error('GET /ghost-projects/analytics error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve analytics', 'DB_ERROR');
  }
});

// ── GET /api/ghost-projects/meta/stats — quick stats ─────────────────────────
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
    successResponse(res, rows[0]);
  } catch (e) {
    errorResponse(res, 500, e.message, 'DB_ERROR');
  }
});

// ── GET /api/ghost-projects/:id — single project ──────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM ghost_projects WHERE id = $1',
      [parseInt(id)]
    );

    if (!rows.length) return errorResponse(res, 404, 'Ghost project not found', 'NOT_FOUND');

    const project = rows[0];

    // Generate fresh satellite analysis
    const satelliteAnalysis = analyseProject(project);

    // Fetch linked contract if available
    let linkedContract = null;
    if (project.contract_ref) {
      const { rows: contractRows } = await pool.query(
        'SELECT contract_id, description, supplier, value, risk_score, risk_level FROM contracts WHERE contract_id = $1',
        [project.contract_ref]
      );
      linkedContract = contractRows[0] || null;
    }

    successResponse(res, {
      ...project,
      satellite_analysis: satelliteAnalysis,
      linked_contract: linkedContract
    });
  } catch (e) {
    console.error('GET /ghost-projects/:id error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve ghost project', 'DB_ERROR');
  }
});

// ── POST /api/ghost-projects — create new ghost project ──────────────────────
router.post('/', async (req, res) => {
  const { valid, errors } = validateGhostProject(req.body);
  if (!valid) return errorResponse(res, 400, errors.join('; '), 'VALIDATION_ERROR');

  const {
    contract_ref, project_name, county, claimed_status,
    satellite_status, amount_at_risk, detection_status
  } = req.body;

  try {
    // Auto-generate satellite analysis if not provided
    let satStatus = satellite_status;
    let detStatus = detection_status || 'flagged';

    if (!satellite_status || !detection_status) {
      const analysis = analyseProject({
        project_name, county, claimed_status, amount_at_risk, contract_ref
      });
      satStatus = satStatus || analysis.satellite_status;
      detStatus = detection_status || analysis.detection_status;
    }

    const { rows } = await pool.query(
      `INSERT INTO ghost_projects
         (contract_ref, project_name, county, claimed_status, satellite_status, amount_at_risk, detection_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [contract_ref || null, project_name, county || null, claimed_status || null,
       satStatus || null, amount_at_risk ? parseInt(amount_at_risk) : 0, detStatus]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('POST /ghost-projects error:', e.message);
    errorResponse(res, 500, 'Failed to create ghost project', 'DB_ERROR');
  }
});

// ── PUT /api/ghost-projects/:id — update project ─────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      contract_ref, project_name, county, claimed_status,
      satellite_status, amount_at_risk, detection_status
    } = req.body;

    const { rows: existing } = await pool.query(
      'SELECT * FROM ghost_projects WHERE id = $1', [parseInt(id)]
    );
    if (!existing.length) return errorResponse(res, 404, 'Ghost project not found', 'NOT_FOUND');

    if (detection_status) {
      const { valid, errors } = validateStatusUpdate(detection_status, ALLOWED_STATUSES);
      if (!valid) return errorResponse(res, 400, errors.join('; '), 'VALIDATION_ERROR');
    }

    const { rows } = await pool.query(
      `UPDATE ghost_projects
       SET contract_ref      = COALESCE($1, contract_ref),
           project_name      = COALESCE($2, project_name),
           county            = COALESCE($3, county),
           claimed_status    = COALESCE($4, claimed_status),
           satellite_status  = COALESCE($5, satellite_status),
           amount_at_risk    = COALESCE($6, amount_at_risk),
           detection_status  = COALESCE($7, detection_status)
       WHERE id = $8
       RETURNING *`,
      [contract_ref || null, project_name || null, county || null,
       claimed_status || null, satellite_status || null,
       amount_at_risk ? parseInt(amount_at_risk) : null,
       detection_status || null, parseInt(id)]
    );

    successResponse(res, rows[0]);
  } catch (e) {
    console.error('PUT /ghost-projects/:id error:', e.message);
    errorResponse(res, 500, 'Failed to update ghost project', 'DB_ERROR');
  }
});

// ── DELETE /api/ghost-projects/:id ───────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM ghost_projects WHERE id = $1 RETURNING id, project_name',
      [parseInt(req.params.id)]
    );
    if (!rows.length) return errorResponse(res, 404, 'Ghost project not found', 'NOT_FOUND');
    successResponse(res, { deleted: rows[0] });
  } catch (e) {
    console.error('DELETE /ghost-projects/:id error:', e.message);
    errorResponse(res, 500, 'Failed to delete ghost project', 'DB_ERROR');
  }
});

module.exports = router;
