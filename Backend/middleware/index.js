'use strict';
const { pool } = require('../db');

// Request logger
const logger = async (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    pool.query(
      'INSERT INTO request_logs (method, path, status_code, response_ms, ip) VALUES ($1,$2,$3,$4,$5)',
      [req.method, req.path, res.statusCode, ms, req.ip]
    ).catch(() => {});
  });
  next();
};

// Centralised error handler
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal server error'
      : err.message,
    path: req.path,
  });
};

// 404 handler
const notFound = (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.originalUrl} not found` });
};

// Validate required fields
const validate = (fields) => (req, res, next) => {
  const missing = fields.filter(f => !req.body[f]);
  if (missing.length) {
    return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
  }
  next();
};

module.exports = { logger, errorHandler, notFound, validate };
