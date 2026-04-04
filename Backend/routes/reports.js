'use strict';

const router = require('express').Router();
const { pool } = require('../db');
const { scoreReport, detectDuplicates } = require('../models/credibilityScorer');
const { validateReport, validateStatusUpdate } = require('../utils/validators');
const { generateCaseNumber, successResponse, errorResponse } = require('../utils/helpers');

const ALLOWED_STATUSES = ['pending', 'reviewing', 'resolved', 'dismissed'];

// ── GET /api/reports — list with filtering ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, type, county, sector, date_from, date_to, page = 1, limit = 100 } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (status)    { conditions.push(`status = $${idx++}`);       values.push(status); }
    if (type)      { conditions.push(`type = $${idx++}`);         values.push(type); }
    if (county)    { conditions.push(`county = $${idx++}`);       values.push(county); }
    if (sector)    { conditions.push(`sector = $${idx++}`);       values.push(sector); }
    if (date_from) { conditions.push(`created_at >= $${idx++}`);  values.push(date_from); }
    if (date_to)   { conditions.push(`created_at <= $${idx++}`);  values.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const p = Math.max(1, parseInt(page));
    const l = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (p - 1) * l;

    const countRes = await pool.query(`SELECT COUNT(*) FROM reports ${where}`, values);
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(
      `SELECT id, case_number, type, county, sector, status, ai_credibility_score,
              anonymous, amount, created_at
       FROM reports ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, l, offset]
    );

    successResponse(res, rows, {
      meta: { total, page: p, limit: l, pages: Math.ceil(total / l) }
    });
  } catch (e) {
    console.error('GET /reports error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve reports', 'DB_ERROR');
  }
});

// ── GET /api/reports/analytics — statistics by type, county, sector ───────────
router.get('/analytics', async (req, res) => {
  try {
    const [byStatus, byType, byCounty, bySector, credibility, totals] = await Promise.all([
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM reports GROUP BY status ORDER BY count DESC
      `),
      pool.query(`
        SELECT type, COUNT(*) AS count,
               ROUND(AVG(ai_credibility_score)) AS avg_credibility
        FROM reports GROUP BY type ORDER BY count DESC
      `),
      pool.query(`
        SELECT county, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'pending') AS pending,
               ROUND(AVG(ai_credibility_score)) AS avg_credibility
        FROM reports WHERE county IS NOT NULL
        GROUP BY county ORDER BY total DESC LIMIT 10
      `),
      pool.query(`
        SELECT sector, COUNT(*) AS total,
               ROUND(AVG(ai_credibility_score)) AS avg_credibility
        FROM reports WHERE sector IS NOT NULL
        GROUP BY sector ORDER BY total DESC
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE ai_credibility_score >= 75) AS high_credibility,
          COUNT(*) FILTER (WHERE ai_credibility_score BETWEEN 45 AND 74) AS medium_credibility,
          COUNT(*) FILTER (WHERE ai_credibility_score < 45) AS low_credibility,
          ROUND(AVG(ai_credibility_score)) AS overall_avg
        FROM reports
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
          COUNT(*) FILTER (WHERE status = 'reviewing') AS reviewing,
          COUNT(*) FILTER (WHERE status = 'resolved')  AS resolved,
          COUNT(*) FILTER (WHERE status = 'dismissed') AS dismissed,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days,
          COUNT(*) FILTER (WHERE anonymous = true) AS anonymous_count,
          COALESCE(SUM(amount), 0) AS total_amount_reported
        FROM reports
      `)
    ]);

    successResponse(res, {
      summary: totals.rows[0],
      by_status: byStatus.rows,
      by_type: byType.rows,
      by_county: byCounty.rows,
      by_sector: bySector.rows,
      credibility_breakdown: credibility.rows[0]
    });
  } catch (e) {
    console.error('GET /reports/analytics error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve analytics', 'DB_ERROR');
  }
});

// ── GET /api/reports/meta/stats — quick stats ─────────────────────────────────
router.get('/meta/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE status = 'resolved')  AS resolved,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days
      FROM reports
    `);
    successResponse(res, rows[0]);
  } catch (e) {
    errorResponse(res, 500, e.message, 'DB_ERROR');
  }
});

// ── GET /api/reports/:id — single report ──────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isNumeric = /^\d+$/.test(id);

    const { rows } = await pool.query(
      `SELECT * FROM reports WHERE ${isNumeric ? 'id' : 'case_number'} = $1`,
      [isNumeric ? parseInt(id) : id]
    );

    if (!rows.length) return errorResponse(res, 404, 'Report not found', 'NOT_FOUND');
    successResponse(res, rows[0]);
  } catch (e) {
    console.error('GET /reports/:id error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve report', 'DB_ERROR');
  }
});

// ── POST /api/reports — submit new report ─────────────────────────────────────
router.post('/', async (req, res) => {
  const { valid, errors } = validateReport(req.body);
  if (!valid) return errorResponse(res, 400, errors.join('; '), 'VALIDATION_ERROR');

  const { type, county, sector, description, amount, anonymous = true } = req.body;
  const case_number = generateCaseNumber();

  try {
    // Fetch existing reports and contracts for cross-referencing
    const [existingReports, existingContracts] = await Promise.all([
      pool.query('SELECT case_number, type, county, description FROM reports WHERE county = $1 ORDER BY created_at DESC LIMIT 50', [county || '']),
      pool.query('SELECT county, risk_level, risk_score FROM contracts WHERE county = $1', [county || ''])
    ]);

    const { score, factors, routing, priority } = scoreReport(
      { type, county, sector, description, amount },
      {
        existingReports: existingReports.rows,
        existingContracts: existingContracts.rows
      }
    );

    const { rows } = await pool.query(
      `INSERT INTO reports
         (case_number, type, county, sector, description, amount, anonymous, ai_credibility_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [case_number, type, county || null, sector || null, description,
       amount ? parseInt(amount) : null, anonymous !== false, score]
    );

    res.status(201).json({
      success: true,
      data: {
        ...rows[0],
        ai_credibility_score: score,
        routing,
        priority,
        credibility_factors: factors
      }
    });
  } catch (e) {
    console.error('POST /reports error:', e.message);
    errorResponse(res, 500, 'Failed to submit report', 'DB_ERROR');
  }
});

// ── PUT /api/reports/:id — update report ──────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, type, county, sector, description, amount } = req.body;

    const { rows: existing } = await pool.query('SELECT * FROM reports WHERE id = $1', [parseInt(id)]);
    if (!existing.length) return errorResponse(res, 404, 'Report not found', 'NOT_FOUND');

    if (status) {
      const { valid, errors } = validateStatusUpdate(status, ALLOWED_STATUSES);
      if (!valid) return errorResponse(res, 400, errors.join('; '), 'VALIDATION_ERROR');
    }

    const { rows } = await pool.query(
      `UPDATE reports
       SET status      = COALESCE($1, status),
           type        = COALESCE($2, type),
           county      = COALESCE($3, county),
           sector      = COALESCE($4, sector),
           description = COALESCE($5, description),
           amount      = COALESCE($6, amount)
       WHERE id = $7
       RETURNING *`,
      [status || null, type || null, county || null, sector || null,
       description || null, amount ? parseInt(amount) : null, parseInt(id)]
    );

    successResponse(res, rows[0]);
  } catch (e) {
    console.error('PUT /reports/:id error:', e.message);
    errorResponse(res, 500, 'Failed to update report', 'DB_ERROR');
  }
});

// ── PATCH /api/reports/:id/status — update status only (admin panel compat) ───
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const { valid, errors } = validateStatusUpdate(status, ALLOWED_STATUSES);
  if (!valid) return errorResponse(res, 400, errors.join('; '), 'VALIDATION_ERROR');

  try {
    const { rows } = await pool.query(
      `UPDATE reports SET status = $1 WHERE id = $2 RETURNING id, case_number, status`,
      [status, parseInt(id)]
    );
    if (!rows.length) return errorResponse(res, 404, 'Report not found', 'NOT_FOUND');
    successResponse(res, rows[0]);
  } catch (e) {
    console.error('PATCH /reports/:id/status error:', e.message);
    errorResponse(res, 500, 'Failed to update status', 'DB_ERROR');
  }
});

// ── DELETE /api/reports/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM reports WHERE id = $1 RETURNING id, case_number',
      [parseInt(req.params.id)]
    );
    if (!rows.length) return errorResponse(res, 404, 'Report not found', 'NOT_FOUND');
    successResponse(res, { deleted: rows[0] });
  } catch (e) {
    console.error('DELETE /reports/:id error:', e.message);
    errorResponse(res, 500, 'Failed to delete report', 'DB_ERROR');
  }
});

module.exports = router;
