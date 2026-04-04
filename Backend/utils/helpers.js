'use strict';

// ── Pagination ────────────────────────────────────────────────────────────────
const paginate = (query, { page = 1, limit = 50 } = {}) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const offset = (p - 1) * l;
  return { sql: `${query} LIMIT ${l} OFFSET ${offset}`, page: p, limit: l, offset };
};

// ── Filtering ─────────────────────────────────────────────────────────────────
const buildWhereClause = (filters = {}, allowedFields = []) => {
  const conditions = [];
  const values = [];
  let idx = 1;

  for (const [key, val] of Object.entries(filters)) {
    if (!allowedFields.includes(key) || val === undefined || val === null || val === '') continue;
    if (key === 'date_from') {
      conditions.push(`created_at >= $${idx++}`);
      values.push(val);
    } else if (key === 'date_to') {
      conditions.push(`created_at <= $${idx++}`);
      values.push(val);
    } else if (key === 'min_value') {
      conditions.push(`value >= $${idx++}`);
      values.push(parseInt(val));
    } else if (key === 'max_value') {
      conditions.push(`value <= $${idx++}`);
      values.push(parseInt(val));
    } else if (key === 'search') {
      conditions.push(`(description ILIKE $${idx} OR supplier ILIKE $${idx} OR contract_id ILIKE $${idx})`);
      values.push(`%${val}%`);
      idx++;
    } else {
      conditions.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
    nextIdx: idx
  };
};

// ── Sorting ───────────────────────────────────────────────────────────────────
const buildOrderClause = (sort, order, allowedSorts = []) => {
  const dir = order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const col = allowedSorts.includes(sort) ? sort : allowedSorts[0] || 'created_at';
  return `ORDER BY ${col} ${dir}`;
};

// ── Date range helper ─────────────────────────────────────────────────────────
const dateRange = (days = 30) => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
};

// ── Currency formatting ───────────────────────────────────────────────────────
const formatKES = (amount) => {
  const n = parseInt(amount) || 0;
  if (n >= 1e9) return `KES ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `KES ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `KES ${(n / 1e3).toFixed(0)}K`;
  return `KES ${n.toLocaleString()}`;
};

// ── Risk level classification ─────────────────────────────────────────────────
const classifyRisk = (score) => {
  if (score >= 75) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
};

// ── Generate unique IDs ───────────────────────────────────────────────────────
const generateContractId = (county = 'KE', year = new Date().getFullYear()) => {
  const seq = Math.floor(1000 + Math.random() * 8999);
  return `KE-PRO-${year}-${seq}`;
};

const generateCaseNumber = () => {
  const year = new Date().getFullYear();
  const seq = Math.floor(1000 + Math.random() * 8999);
  return `KW-${year}-${seq}`;
};

// ── Response helpers ──────────────────────────────────────────────────────────
const successResponse = (res, data, meta = {}) => {
  res.json({ success: true, data, ...meta });
};

const errorResponse = (res, status, message, code = null) => {
  const body = { success: false, error: message };
  if (code) body.code = code;
  res.status(status).json(body);
};

// ── Parse JSON safely ─────────────────────────────────────────────────────────
const safeParseJSON = (val, fallback = []) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) return val;
  try { return JSON.parse(val); } catch { return fallback; }
};

module.exports = {
  paginate,
  buildWhereClause,
  buildOrderClause,
  dateRange,
  formatKES,
  classifyRisk,
  generateContractId,
  generateCaseNumber,
  successResponse,
  errorResponse,
  safeParseJSON
};
