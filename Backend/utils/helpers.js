'use strict';

function paginate(query, page = 1, limit = 20) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (p - 1) * l;
  return { limit: l, offset, page: p };
}

function paginationMeta(total, page, limit) {
  return {
    total: parseInt(total),
    page: parseInt(page),
    limit: parseInt(limit),
    pages: Math.ceil(total / limit),
    has_next: page * limit < total,
    has_prev: page > 1,
  };
}

function safeJSON(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return val || [];
}

function fmtKES(n) {
  if (!n) return 'KES 0';
  if (n >= 1e9) return `KES ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `KES ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `KES ${(n / 1e3).toFixed(0)}K`;
  return `KES ${n}`;
}

function buildWhereClause(filters, alias = '') {
  const conditions = [];
  const values = [];
  let idx = 1;
  const a = alias ? alias + '.' : '';

  if (filters.county) {
    conditions.push(`${a}county ILIKE $${idx++}`);
    values.push(`%${filters.county}%`);
  }
  if (filters.sector) {
    conditions.push(`${a}sector ILIKE $${idx++}`);
    values.push(`%${filters.sector}%`);
  }
  if (filters.risk_level) {
    conditions.push(`${a}risk_level = $${idx++}`);
    values.push(filters.risk_level.toUpperCase());
  }
  if (filters.status) {
    conditions.push(`${a}status = $${idx++}`);
    values.push(filters.status);
  }
  if (filters.type) {
    conditions.push(`${a}type ILIKE $${idx++}`);
    values.push(`%${filters.type}%`);
  }
  if (filters.detection_status) {
    conditions.push(`${a}detection_status = $${idx++}`);
    values.push(filters.detection_status);
  }
  if (filters.min_value) {
    conditions.push(`${a}value >= $${idx++}`);
    values.push(parseInt(filters.min_value));
  }
  if (filters.max_value) {
    conditions.push(`${a}value <= $${idx++}`);
    values.push(parseInt(filters.max_value));
  }
  if (filters.search) {
    conditions.push(`(${a}description ILIKE $${idx} OR ${a}supplier ILIKE $${idx} OR ${a}contract_id ILIKE $${idx})`);
    values.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, values };
}

function allowedSort(field, allowed, defaultField = 'created_at') {
  return allowed.includes(field) ? field : defaultField;
}

function caseNum(prefix = 'KW') {
  const yr = new Date().getFullYear();
  const num = Math.floor(1000 + Math.random() * 89999);
  return `${prefix}-${yr}-${num}`;
}

module.exports = { paginate, paginationMeta, safeJSON, fmtKES, buildWhereClause, allowedSort, caseNum };
