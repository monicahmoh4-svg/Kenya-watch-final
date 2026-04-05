'use strict';
const router = require('express').Router();
const { pool } = require('../db');
const { scoreContract } = require('../models/riskScorer');
const { paginate, paginationMeta, safeJSON, buildWhereClause, allowedSort } = require('../utils/helpers');

// GET /api/contracts — list with filters, pagination, sorting
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, offset } = paginate(req.query.page, req.query.limit);
    const sort = allowedSort(req.query.sort, ['risk_score','value','created_at','awarded_date'], 'risk_score');
    const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
    const { where, values } = buildWhereClause(req.query);

    const dataQ = `SELECT * FROM contracts ${where} ORDER BY ${sort} ${dir} LIMIT $${values.length+1} OFFSET $${values.length+2}`;
    const countQ = `SELECT COUNT(*) FROM contracts ${where}`;

    const [data, count] = await Promise.all([
      pool.query(dataQ, [...values, limit, offset]),
      pool.query(countQ, values),
    ]);

    res.json({
      success: true,
      data: data.rows.map(r => ({ ...r, flags: safeJSON(r.flags) })),
      meta: paginationMeta(count.rows[0].count, page, limit),
    });
  } catch (err) { next(err); }
});

// GET /api/contracts/analytics — risk distribution & county breakdown
router.get('/analytics', async (req, res, next) => {
  try {
    const [risk, county, sector, top] = await Promise.all([
      pool.query(`SELECT risk_level, COUNT(*) AS count, SUM(value) AS total_value FROM contracts GROUP BY risk_level ORDER BY count DESC`),
      pool.query(`SELECT county, COUNT(*) AS count, AVG(risk_score)::INT AS avg_risk, SUM(value) AS total_value FROM contracts GROUP BY county ORDER BY avg_risk DESC LIMIT 20`),
      pool.query(`SELECT sector, COUNT(*) AS count, AVG(risk_score)::INT AS avg_risk, SUM(value) AS total_value FROM contracts GROUP BY sector ORDER BY avg_risk DESC`),
      pool.query(`SELECT supplier, COUNT(*) AS contract_count, AVG(risk_score)::INT AS avg_risk, SUM(value) AS total_value FROM contracts GROUP BY supplier HAVING COUNT(*) >= 1 ORDER BY avg_risk DESC LIMIT 15`),
    ]);
    res.json({
      success: true,
      data: {
        risk_distribution: risk.rows,
        county_breakdown: county.rows,
        sector_breakdown: sector.rows,
        top_suppliers_by_risk: top.rows,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/contracts/search — full-text search
router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q || '';
    if (!q.trim()) return res.json({ success: true, data: [] });
    const { rows } = await pool.query(
      `SELECT * FROM contracts WHERE description ILIKE $1 OR supplier ILIKE $1 OR contract_id ILIKE $1 OR county ILIKE $1 OR sector ILIKE $1 ORDER BY risk_score DESC LIMIT 30`,
      [`%${q}%`]
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, flags: safeJSON(r.flags) })) });
  } catch (err) { next(err); }
});

// GET /api/contracts/:id — single contract + supplier history
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contracts WHERE id=$1 OR contract_id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Contract not found' });
    const contract = { ...rows[0], flags: safeJSON(rows[0].flags) };

    const { rows: history } = await pool.query(
      `SELECT contract_id, description, value, risk_score, risk_level, awarded_date FROM contracts WHERE supplier ILIKE $1 AND id != $2 ORDER BY awarded_date DESC LIMIT 10`,
      [`%${contract.supplier}%`, contract.id]
    );
    res.json({ success: true, data: contract, supplier_history: history });
  } catch (err) { next(err); }
});

// POST /api/contracts — create with AI scoring
router.post('/', async (req, res, next) => {
  try {
    const { contract_id, description, county, sector, value, supplier, supplier_reg_date, bid_type, awarded_date, procuring_entity, contact_officer } = req.body;
    if (!contract_id || !description || !supplier) {
      return res.status(400).json({ success: false, error: 'contract_id, description and supplier are required' });
    }
    const { score, risk_level, flags } = scoreContract({ contract_id, description, value: parseInt(value), supplier, supplier_reg_date, bid_type, awarded_date, sector, county });
    const { rows } = await pool.query(
      `INSERT INTO contracts (contract_id,description,county,sector,value,supplier,supplier_reg_date,bid_type,awarded_date,risk_score,risk_level,flags,procuring_entity,contact_officer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (contract_id) DO UPDATE SET risk_score=$10,risk_level=$11,flags=$12,updated_at=NOW()
       RETURNING *`,
      [contract_id, description, county||null, sector||null, parseInt(value)||0, supplier,
       supplier_reg_date||null, bid_type||'open', awarded_date||null,
       score, risk_level, JSON.stringify(flags), procuring_entity||null, contact_officer||null]
    );
    res.status(201).json({ success: true, data: { ...rows[0], flags } });
  } catch (err) { next(err); }
});

// PUT /api/contracts/:id — update
router.put('/:id', async (req, res, next) => {
  try {
    const { description, county, sector, value, supplier, supplier_reg_date, bid_type, awarded_date, status, procuring_entity } = req.body;
    const { rows: existing } = await pool.query('SELECT * FROM contracts WHERE id=$1 OR contract_id=$1', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Contract not found' });
    const c = existing[0];
    const merged = {
      description: description || c.description,
      county: county || c.county,
      sector: sector || c.sector,
      value: value ? parseInt(value) : c.value,
      supplier: supplier || c.supplier,
      supplier_reg_date: supplier_reg_date || c.supplier_reg_date,
      bid_type: bid_type || c.bid_type,
      awarded_date: awarded_date || c.awarded_date,
      status: status || c.status,
      procuring_entity: procuring_entity || c.procuring_entity,
    };
    const { score, risk_level, flags } = scoreContract({ ...merged });
    const { rows } = await pool.query(
      `UPDATE contracts SET description=$1,county=$2,sector=$3,value=$4,supplier=$5,supplier_reg_date=$6,bid_type=$7,awarded_date=$8,status=$9,procuring_entity=$10,risk_score=$11,risk_level=$12,flags=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,
      [merged.description,merged.county,merged.sector,merged.value,merged.supplier,merged.supplier_reg_date,merged.bid_type,merged.awarded_date,merged.status,merged.procuring_entity,score,risk_level,JSON.stringify(flags),c.id]
    );
    res.json({ success: true, data: { ...rows[0], flags } });
  } catch (err) { next(err); }
});

// DELETE /api/contracts/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM contracts WHERE id=$1 OR contract_id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Contract not found' });
    res.json({ success: true, message: 'Contract deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
