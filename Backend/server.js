'use strict';
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const { initDB, pool } = require('./db');

const app  = express();
const PORT = process.env.PORT || 5000;
let dbReady = false;

// ── Security ──────────────────────────────────────────────────────────────────
// contentSecurityPolicy disabled so admin panel inline scripts work
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());

// ── Rate limiting — NO separate /api/sync limiter (causes 404 after ~10 reqs) ─
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

// ── Admin panel ───────────────────────────────────────────────────────────────
// MUST be registered before the 404 handler and before API routes
// so that GET /admin and GET /admin/ both serve the HTML file.
const adminDir = path.join(__dirname, 'admin');
app.use('/admin', express.static(adminDir, { index: 'index.html' }));
app.get('/admin',  (_req, res) => res.sendFile(path.join(adminDir, 'index.html')));
app.get('/admin/', (_req, res) => res.sendFile(path.join(adminDir, 'index.html')));

// ── Health — always 200 so Railway healthcheck passes ─────────────────────────
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { if (dbReady) { await pool.query('SELECT 1'); dbOk = true; } } catch (_) {}
  return res.status(200).json({
    status:    dbOk ? 'ok' : 'starting',
    database:  dbOk ? 'connected' : 'connecting',
    ai:        process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing_api_key',
    timestamp: new Date().toISOString(),
    version:   '3.2.0',
  });
});

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({
  name:    'KenyaWatch AI Backend',
  version: '3.2.0',
  status:  'running',
  db:      dbReady ? 'connected' : 'connecting',
  admin:   '/admin',
  routes: [
    'GET  /admin',
    'GET  /health',
    'GET  /api/stats',
    'GET  /api/contracts',
    'POST /api/contracts/scan',
    'GET  /api/reports',
    'POST /api/reports',
    'PATCH /api/reports/:id/status',
    'GET  /api/ghost-projects',
    'POST /api/ghost-projects',
    'POST /api/ghost-projects/:id/refresh-satellite',
    'POST /api/ai/chat',
    'POST /api/chatbot/message',
    'POST /api/sync/ocds',
    'GET  /api/sync/status',
  ],
}));

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/stats', async (_req, res) => {
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

// ── Feature routes — MUST come before the 404 handler ────────────────────────
app.use('/api/contracts',      require('./routes/contracts'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/ghost-projects', require('./routes/ghostProjects'));
app.use('/api/ai',             require('./routes/ai'));
app.use('/api/chatbot',        require('./routes/chatbot'));
app.use('/api/sync',           require('./routes/ocdsSync'));

// ── 404 ───────────────────────────────────────────────────────────────────────
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

// ── Startup: listen FIRST, DB init in background ─────────────────────────────
// listen() is called before initDB() so Railway's /health check always
// gets a 200 immediately. The DB connects in the background.
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 KenyaWatch AI v3.2 on port ' + PORT);
  console.log('🖥  Admin: http://localhost:' + PORT + '/admin');
  console.log('🤖 AI  : ' + (process.env.ANTHROPIC_API_KEY ? 'READY' : '⚠  Set ANTHROPIC_API_KEY in Railway Variables'));
  console.log('🗄  DB  : ' + (process.env.DATABASE_URL ? 'connecting...' : '⚠  Set DATABASE_URL in Railway Variables'));

  initDB()
    .then(() => {
      dbReady = true;
      console.log('✅ Database ready — all routes operational');
    })
    .catch((e) => {
      console.error('⚠  DB init failed:', e.message);
      // Server stays up. /health stays green. DB routes return 500 until reconnected.
    });
});
