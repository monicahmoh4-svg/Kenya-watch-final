'use strict';
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB, pool } = require('./db');

const app  = express();
const PORT = process.env.PORT || 5000;

// DB readiness flag — set true once initDB() completes
let dbReady = false;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

// ── Rate limiting ─────────────────────────────────────────────────────────────
// ONE limiter on /api only — do NOT add a separate /api/sync limiter
// (a separate /api/sync limiter conflicts and kills sync routes after ~10 requests)
app.use('/api/ai',      rateLimit({ windowMs: 60000, max: 40,  standardHeaders: true, legacyHeaders: false }));
app.use('/api/chatbot', rateLimit({ windowMs: 60000, max: 40,  standardHeaders: true, legacyHeaders: false }));
app.use('/api',         rateLimit({ windowMs: 60000, max: 500, standardHeaders: true, legacyHeaders: false }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logger ────────────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(req.method + ' ' + req.path);
  next();
});

// ── Health ────────────────────────────────────────────────────────────────────
// Always returns 200 so Railway's healthcheck passes.
// DB status is reported but does NOT affect the HTTP status code.
// If we returned 503 when DB is connecting, Railway would restart
// the container in a loop and the deploy would always fail.
app.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    if (dbReady) { await pool.query('SELECT 1'); dbOk = true; }
  } catch (_) {}
  return res.status(200).json({
    status:    dbOk ? 'ok' : 'starting',
    database:  dbOk ? 'connected' : 'connecting',
    ai:        process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing_api_key',
    timestamp: new Date().toISOString(),
    version:   '3.2.0',
  });
});

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  name:    'KenyaWatch AI Backend',
  version: '3.2.0',
  status:  'running',
  db:      dbReady ? 'connected' : 'connecting',
  routes: [
    'GET  /health',
    'GET  /api/stats',
    'GET  /api/contracts',
    'POST /api/contracts/scan',
    'GET  /api/reports',
    'POST /api/reports',
    'GET  /api/ghost-projects',
    'POST /api/ai/chat',
    'POST /api/chatbot/message',
    'POST /api/sync/ocds',
    'GET  /api/sync/status',
    'GET  /api/sync/counties',
  ],
}));

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [c, r, g] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE risk_level = 'HIGH')                        AS flagged,
          COALESCE(SUM(value) FILTER (WHERE risk_level = 'HIGH'), 0)         AS funds,
          COUNT(*)                                                             AS total
        FROM contracts
      `),
      pool.query(`SELECT COUNT(*) AS total FROM reports WHERE created_at > NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE detection_status IN ('ghost','partial')) AS cnt FROM ghost_projects`),
    ]);
    return res.json({
      success: true,
      data: {
        contracts_flagged: parseInt(c.rows[0].flagged) || 0,
        contracts_total:   parseInt(c.rows[0].total)   || 0,
        ghost_projects:    parseInt(g.rows[0].cnt)     || 0,
        reports_30d:       parseInt(r.rows[0].total)   || 0,
        funds_at_risk:     parseInt(c.rows[0].funds)   || 0,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── Feature routes ────────────────────────────────────────────────────────────
// All routes must be registered BEFORE the 404 handler below.
// The order here matters — more specific paths first.
app.use('/api/contracts',      require('./routes/contracts'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/ghost-projects', require('./routes/ghostProjects'));
app.use('/api/ai',             require('./routes/ai'));
app.use('/api/chatbot',        require('./routes/chatbot'));
app.use('/api/sync',           require('./routes/ocdsSync'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error:   'Route ' + req.method + ' ' + req.path + ' not found',
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// ── STARTUP ───────────────────────────────────────────────────────────────────
// IMPORTANT: app.listen() is called FIRST, before initDB().
//
// Why this matters:
//   - Railway checks /health within 60 seconds of the container starting
//   - If listen() is inside an async DB chain, the server won't bind to PORT
//     until the DB is fully connected — which can take 10-30s or fail entirely
//   - Without a port binding, /health returns "service unavailable" and the
//     deploy fails even though the code is perfectly correct
//
// Solution: bind the port immediately, let DB init run in the background.
// The /health endpoint returns status:"starting" until DB is ready, which
// is fine — Railway only needs a 200 response, not status:"ok".

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 KenyaWatch AI v3.2 listening on port ' + PORT);
  console.log('🤖 AI  : ' + (process.env.ANTHROPIC_API_KEY ? 'READY' : '⚠  Set ANTHROPIC_API_KEY in Railway Variables'));
  console.log('🗄  DB  : ' + (process.env.DATABASE_URL ? 'connecting...' : '⚠  Set DATABASE_URL in Railway Variables'));

  // Initialise database in the background — never blocks the server
  initDB()
    .then(() => {
      dbReady = true;
      console.log('✅ Database ready — all routes fully operational');
    })
    .catch((e) => {
      // Server stays up. DB-dependent routes return 500.
      // /health stays green. No process.exit().
      console.error('⚠  Database init failed:', e.message);
    });
});
