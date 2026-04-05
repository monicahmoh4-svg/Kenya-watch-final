'use strict';
const router = require('express').Router();
const { pool } = require('../db');
const { scoreReport } = require('../models/credibilityScorer');
const { paginate, paginationMeta, safeJSON, buildWhereClause, allowedSort, caseNum } = require('../utils/helpers');

// GET /api/reports
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);
    const sort = allowedSort(req.query.sort, ['ai_credibility_score','created_at','amount'], 'created_at');
    const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
    const { where, values } = buildWhereClause(req.query);

    const [data, count] = await Promise.all([
      pool.query(`SELECT id,case_number,type,county,sector,status,ai_credibility_score,routing,amount,anonymous,related_contract_id,created_at,updated_at FROM reports ${where} ORDER BY ${sort} ${dir} LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM reports ${where}`, values),
    ]);
    res.json({ success: true, data: data.rows, meta: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { next(err); }
});

// GET /api/reports/analytics
router.get('/analytics', async (req, res, next) => {
  try {
    const [status, type, county, credibility] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) AS count FROM reports GROUP BY status ORDER BY count DESC`),
      pool.query(`SELECT type, COUNT(*) AS count, AVG(ai_credibility_score)::INT AS avg_score FROM reports GROUP BY type ORDER BY count DESC`),
      pool.query(`SELECT county, COUNT(*) AS count, AVG(ai_credibility_score)::INT AS avg_score FROM reports WHERE county IS NOT NULL GROUP BY county ORDER BY count DESC LIMIT 15`),
      pool.query(`SELECT CASE WHEN ai_credibility_score >= 85 THEN 'high' WHEN ai_credibility_score >= 60 THEN 'medium' ELSE 'low' END AS tier, COUNT(*) AS count FROM reports GROUP BY tier`),
    ]);
    res.json({
      success: true,
      data: {
        by_status: status.rows,
        by_type: type.rows,
        by_county: county.rows,
        credibility_tiers: credibility.rows,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/reports/:id — full report (no PII description if anonymous)
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM reports WHERE id=$1 OR case_number=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Report not found' });
    const r = { ...rows[0], keywords: safeJSON(rows[0].keywords) };
    if (r.anonymous) {
      delete r.description; // strip description for anonymous reports in public API
      r.description = '[REDACTED — anonymous report]';
    }
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
});

// POST /api/reports — submit with AI credibility scoring
router.post('/', async (req, res, next) => {
  try {
    const { type, county, sector, description, amount, anonymous, related_contract_id } = req.body;
    if (!type || !description) {
      return res.status(400).json({ success: false, error: 'type and description are required' });
    }
    const case_number = caseNum();
    const { score, routing, keywords, recommendation } = scoreReport({ type, county, sector, description, amount: parseInt(amount) });

    const { rows } = await pool.query(
      `INSERT INTO reports (case_number,type,county,sector,description,amount,anonymous,ai_credibility_score,routing,keywords,related_contract_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,case_number,status,ai_credibility_score,routing,created_at`,
      [case_number, type, county||null, sector||null, description,
       amount ? parseInt(amount) : null, anonymous !== false,
       score, routing, JSON.stringify(keywords), related_contract_id||null]
    );
    res.status(201).json({ success: true, data: { ...rows[0], recommendation } });
  } catch (err) { next(err); }
});

// PUT /api/reports/:id — update
router.put('/:id', async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query('SELECT * FROM reports WHERE id=$1 OR case_number=$1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Report not found' });
    const r = existing[0];
    const updated = {
      type: req.body.type || r.type,
      county: req.body.county || r.county,
      sector: req.body.sector || r.sector,
      description: req.body.description || r.description,
      amount: req.body.amount ? parseInt(req.body.amount) : r.amount,
    };
    const { score, routing, keywords } = scoreReport(updated);
    const { rows } = await pool.query(
      `UPDATE reports SET type=$1,county=$2,sector=$3,description=$4,amount=$5,ai_credibility_score=$6,routing=$7,keywords=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [updated.type, updated.county, updated.sector, updated.description, updated.amount, score, routing, JSON.stringify(keywords), r.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/reports/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'reviewing', 'escalated', 'resolved', 'dismissed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
    }
    const extras = {};
    if (status === 'escalated') extras.escalated_at = new Date().toISOString();
    if (status === 'resolved') extras.resolved_at = new Date().toISOString();

    const { rows } = await pool.query(
      `UPDATE reports SET status=$1, escalated_at=COALESCE($2::timestamptz, escalated_at), resolved_at=COALESCE($3::timestamptz, resolved_at), updated_at=NOW() WHERE id=$4 OR case_number=$4 RETURNING id,case_number,status`,
      [status, extras.escalated_at||null, extras.resolved_at||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/reports/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM reports WHERE id=$1 OR case_number=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, message: 'Report deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
