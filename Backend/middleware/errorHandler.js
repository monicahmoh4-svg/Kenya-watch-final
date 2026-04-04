'use strict';

const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Log server errors
  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path} — ${message}`);
    if (err.stack) console.error(err.stack);
  }

  // Handle specific error types
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Request body too large',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      code: 'INVALID_JSON'
    });
  }

  res.status(status).json({
    success: false,
    error: status >= 500 ? 'Internal server error' : message,
    code: err.code || (status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR'),
    ...(process.env.NODE_ENV === 'development' && status >= 500 ? { detail: message } : {})
  });
};

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND'
  });
};

module.exports = { errorHandler, notFound };
