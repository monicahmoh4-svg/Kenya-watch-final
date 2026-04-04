'use strict';

const router = require('express').Router();
const { pool } = require('../db');
const { scoreContract, analyseSupplierTrend } = require('../models/riskScorer');
const { validateContract } = require('../utils/validators');
const {
  buildWhereClause, buildOrderClause, classifyRisk,
  generateContractId, successResponse, errorResponse, safeParseJSON
} = require('../utils/helpers');

// ── Allowed filter fields ─────────────────────────────────────────────────────
const ALLOWED_FILTERS = ['county', 'risk_level', 'sector', 'date_from', 'date_to', 'min_value', 'max_value', 'search'];
const ALLOWED_SORTS   = ['risk_score', 'value', 'created_at', 'county', 'supplier'];

// ── GET /api/contracts — list with filtering, sorting, pagination ─────────────
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, sort = 'risk_score', order = 'DESC', ...filters } = req.query;
    const { where, values } = buildWhereClause(filters, ALLOWED_FILTERS);
    const orderClause = buildOrderClause(sort, order, ALLOWED_SORTS);

    const countRes = await pool.query(`SELECT COUNT(*) FROM contracts ${where}`, values);
    const total = parseInt(countRes.rows[0].count);

    const p = Math.max(1, parseInt(page));
    const l = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (p - 1) * l;

    const { rows } = await pool.query(
      `SELECT * FROM contracts ${where} ${orderClause} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, l, offset]
    );

    // Normalise flags field
    const data = rows.map(r => ({ ...r, flags: safeParseJSON(r.flags, []) }));

    successResponse(res, data, {
      meta: { total, page: p, limit: l, pages: Math.ceil(total / l) }
    });
  } catch (e) {
    console.error('GET /contracts error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve contracts', 'DB_ERROR');
  }
});

// ── GET /api/contracts/analytics — risk distribution, county breakdown ────────
router.get('/analytics', async (req, res) => {
  try {
    const [riskDist, countyBreakdown, supplierAnalysis, sectorBreakdown, totals] = await Promise.all([
      // Risk distribution
      pool.query(`
        SELECT risk_level,
               COUNT(*) AS count,
               COALESCE(SUM(value), 0) AS total_value,
               ROUND(AVG(risk_score)) AS avg_score
        FROM contracts
        GROUP BY risk_level
        ORDER BY CASE risk_level WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
      `),
      // County breakdown
      pool.query(`
        SELECT county,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high_risk,
               COALESCE(SUM(value) FILTER (WHERE risk_level = 'HIGH'), 0) AS high_risk_value,
               ROUND(AVG(risk_score)) AS avg_score
        FROM contracts
        WHERE county IS NOT NULL
        GROUP BY county
        ORDER BY high_risk DESC, avg_score DESC
        LIMIT 15
      `),
      // Top flagged suppliers
      pool.query(`
        SELECT supplier,
               COUNT(*) AS contract_count,
               ROUND(AVG(risk_score)) AS avg_risk_score,
               COALESCE(SUM(value), 0) AS total_value,
               COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high_risk_count
        FROM contracts
        GROUP BY supplier
        HAVING COUNT(*) > 0
        ORDER BY avg_risk_score DESC, contract_count DESC
        LIMIT 10
      `),
      // Sector breakdown
      pool.query(`
        SELECT sector,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high_risk,
               COALESCE(SUM(value), 0) AS total_value
        FROM contracts
        WHERE sector IS NOT NULL
        GROUP BY sector
        ORDER BY high_risk DESC
      `),
      // Overall totals
      pool.query(`
        SELECT
          COUNT(*) AS total_contracts,
          COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high_risk_count,
          COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS medium_risk_count,
          COUNT(*) FILTER (WHERE risk_level = 'LOW') AS low_risk_count,
          COALESCE(SUM(value), 0) AS total_value,
          COALESCE(SUM(value) FILTER (WHERE risk_level = 'HIGH'), 0) AS high_risk_value,
          ROUND(AVG(risk_score)) AS avg_risk_score
        FROM contracts
      `)
    ]);

    successResponse(res, {
      summary: totals.rows[0],
      risk_distribution: riskDist.rows,
      county_breakdown: countyBreakdown.rows,
      supplier_analysis: supplierAnalysis.rows,
      sector_breakdown: sectorBreakdown.rows
    });
  } catch (e) {
    console.error('GET /contracts/analytics error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve analytics', 'DB_ERROR');
  }
});

// ── GET /api/contracts/search — advanced multi-field search ──────────────────
router.get('/search', async (req, res) => {
  try {
    const { q = '', county, risk_level, sector, min_value, max_value, date_from, date_to } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (q) {
      conditions.push(`(
        description ILIKE $${idx} OR
        supplier ILIKE $${idx} OR
        contract_id ILIKE $${idx} OR
        county ILIKE $${idx}
      )`);
      values.push(`%${q}%`);
      idx++;
    }
    if (county)     { conditions.push(`county = $${idx++}`);      values.push(county); }
    if (risk_level) { conditions.push(`risk_level = $${idx++}`);  values.push(risk_level); }
    if (sector)     { conditions.push(`sector = $${idx++}`);      values.push(sector); }
    if (min_value)  { conditions.push(`value >= $${idx++}`);      values.push(parseInt(min_value)); }
    if (max_value)  { conditions.push(`value <= $${idx++}`);      values.push(parseInt(max_value)); }
    if (date_from)  { conditions.push(`created_at >= $${idx++}`); values.push(date_from); }
    if (date_to)    { conditions.push(`created_at <= $${idx++}`); values.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM contracts ${where} ORDER BY risk_score DESC LIMIT 100`,
      values
    );

    const data = rows.map(r => ({ ...r, flags: safeParseJSON(r.flags, []) }));
    successResponse(res, data, { meta: { count: data.length, query: q } });
  } catch (e) {
    console.error('GET /contracts/search error:', e.message);
    errorResponse(res, 500, 'Search failed', 'DB_ERROR');
  }
});

// ── GET /api/contracts/meta/stats — quick stats for admin panel ───────────────
router.get('/meta/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE risk_level = 'HIGH')   AS high_risk,
        COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS medium_risk,
        COUNT(*) FILTER (WHERE risk_level = 'LOW')    AS low_risk,
        COUNT(*) AS total,
        COALESCE(SUM(value) FILTER (WHERE risk_level = 'HIGH'), 0) AS high_risk_value
      FROM contracts
    `);
    successResponse(res, rows[0]);
  } catch (e) {
    errorResponse(res, 500, e.message, 'DB_ERROR');
  }
});

// ── GET /api/contracts/:id — single contract ──────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isNumeric = /^\d+$/.test(id);

    const { rows } = await pool.query(
      `SELECT * FROM contracts WHERE ${isNumeric ? 'id' : 'contract_id'} = $1`,
      [isNumeric ? parseInt(id) : id]
    );

    if (!rows.length) return errorResponse(res, 404, 'Contract not found', 'NOT_FOUND');

    const contract = { ...rows[0], flags: safeParseJSON(rows[0].flags, []) };

    // Fetch supplier history for context
    const { rows: supplierHistory } = await pool.query(
      `SELECT contract_id, description, value, risk_score, risk_level, created_at
       FROM contracts WHERE supplier = $1 AND id != $2 ORDER BY created_at DESC LIMIT 5`,
      [contract.supplier, contract.id]
    );

    const trend = analyseSupplierTrend([contract, ...supplierHistory]);

    successResponse(res, { ...contract, supplier_history: supplierHistory, supplier_trend: trend });
  } catch (e) {
    console.error('GET /contracts/:id error:', e.message);
    errorResponse(res, 500, 'Failed to retrieve contract', 'DB_ERROR');
  }
});

// ── POST /api/contracts — create new contract with AI risk scoring ────────────
router.post('/', async (req, res) => {
  const { valid, errors } = validateContract(req.body);
  if (!valid) return errorResponse(res, 400, errors.join('; '), 'VALIDATION_ERROR');

  const { contract_id, description, county, value, supplier, sector } = req.body;
  const cid = (contract_id || generateContractId()).trim().toUpperCase();

  try {
    // Check for duplicate
    const { rows: existing } = await pool.query(
      'SELECT id FROM contracts WHERE contract_id = $1', [cid]
    );
    if (existing.length) return errorResponse(res, 409, `Contract ${cid} already exists`, 'DUPLICATE');

    // Fetch existing contracts for supplier history
    const { rows: allContracts } = await pool.query(
      'SELECT contract_id, supplier, risk_score, value FROM contracts WHERE supplier ILIKE $1',
      [supplier]
    );

    const { score, risk_level, flags } = scoreContract(
      { contract_id: cid, description, county, value, supplier },
      { existingContracts: allContracts }
    );

    const { rows } = await pool.query(
      `INSERT INTO contracts (contract_id, description, county, sector, value, supplier, risk_score, risk_level, flags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [cid, description || 'N/A', county || 'N/A', sector || null,
       parseInt(value), supplier, score, risk_level, JSON.stringify(flags)]
    );

    const result = { ...rows[0], flags: safeParseJSON(rows[0].flags, []) };
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    console.error('POST /contracts error:', e.message);
    errorResponse(res, 500, 'Failed to create contract', 'DB_ERROR');
  }
});

// ── POST /api/contracts/scan — scan & upsert (legacy + admin panel compat) ────
router.post('/scan', async (req, res) => {
  const { valid, errors } = validateContract(req.body);
  if (!valid) return errorResponse(res, 400, errors.join('; '), 'VALIDATION_ERROR');

  const { contract_id, description, county, value, supplier, sector } = req.body;
  const cid = (contract_id || generateContractId()).trim().toUpperCase();

  try {
    const { rows: allContracts } = await pool.query(
      'SELECT contract_id, supplier, risk_score, value FROM contracts WHERE supplier ILIKE $1',
      [supplier]
    );

    const { score, risk_level, flags, details } = scoreContract(
      { contract_id: cid, description, county, value, supplier },
      { existingContracts: allContracts }
    );

    const { rows } = await pool.query(
      `INSERT INTO contracts (contract_id, description, county, sector, value, supplier, risk_score, risk_level, flags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (contract_id) DO UPDATE
         SET description = EXCLUDED.description,
             county      = EXCLUDED.county,
             sector      = EXCLUDED.sector,
             value       = EXCLUDED.value,
             supplier    = EXCLUDED.supplier,
             risk_score  = EXCLUDED.risk_score,
             risk_level  = EXCLUDED.risk_level,
             flags       = EXCLUDED.flags
       RETURNING *`,
      [cid, description || 'N/A', county || 'N/A', sector || null,
       parseInt(value), supplier, score, risk_level, JSON.stringify(flags)]
    );

    const result = { ...rows[0], flags: safeParseJSON(rows[0].flags, []), analysis_details: details };
    successResponse(res, result);
  } catch (e) {
    console.error('POST /contracts/scan error:', e.message);
    errorResponse(res, 500, 'Scan failed', 'DB_ERROR');
  }
});

// ── PUT /api/contracts/:id — update contract ──────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { description, county, sector, value, supplier, risk_score, risk_level, flags } = req.body;

    const { rows: existing } = await pool.query('SELECT * FROM contracts WHERE id = $1', [parseInt(id)]);
    if (!existing.length) return errorResponse(res, 404, 'Contract not found', 'NOT_FOUND');

    const current = existing[0];
    const newValue = value !== undefined ? parseInt(value) : current.value;
    const newSupplier = supplier || current.supplier;
    const newDesc = description || current.description;
    const newCounty = county || current.county;
    const newSector = sector !== undefined ? sector : current.sector;

    // Re-score if key fields changed
    let newScore = risk_score !== undefined ? parseInt(risk_score) : current.risk_score;
    let newLevel = risk_level || current.risk_level;
    let newFlags = flags ? JSON.stringify(flags) : current.flags;

    if (value !== undefined || supplier !== undefined || description !== undefined) {
      const { rows: allContracts } = await pool.query(
        'SELECT contract_id, supplier, risk_score, value FROM contracts WHERE supplier ILIKE $1 AND id != $2',
        [newSupplier, parseInt(id)]
      );
      const scored = scoreContract(
        { contract_id: current.contract_id, description: newDesc, county: newCounty, value: newValue, supplier: newSupplier },
        { existingContracts: allContracts }
      );
      newScore = scored.score;
      newLevel = scored.risk_level;
      newFlags = JSON.stringify(scored.flags);
    }

    const { rows } = await pool.query(
      `UPDATE contracts
       SET description = $1, county = $2, sector = $3, value = $4, supplier = $5,
           risk_score = $6, risk_level = $7, flags = $8
       WHERE id = $9
       RETURNING *`,
      [newDesc, newCounty, newSector, newValue, newSupplier, newScore, newLevel, newFlags, parseInt(id)]
    );

    successResponse(res, { ...rows[0], flags: safeParseJSON(rows[0].flags, []) });
  } catch (e) {
    console.error('PUT /contracts/:id error:', e.message);
    errorResponse(res, 500, 'Failed to update contract', 'DB_ERROR');
  }
});

// ── DELETE /api/contracts/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM contracts WHERE id = $1 RETURNING id, contract_id',
      [parseInt(req.params.id)]
    );
    if (!rows.length) return errorResponse(res, 404, 'Contract not found', 'NOT_FOUND');
    successResponse(res, { deleted: rows[0] });
  } catch (e) {
    console.error('DELETE /contracts/:id error:', e.message);
    errorResponse(res, 500, 'Failed to delete contract', 'DB_ERROR');
  }
});

module.exports = router;
