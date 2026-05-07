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

// ── Paths ─────────────────────────────────────────────────────────────────────
// __dirname = /app/Backend  (on Render)  or  /home/claude/kw/Backend (local)
// Frontend is at: <repo-root>/frontend/public/index.html
// Admin is at:    <repo-root>/Backend/admin/index.html
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'public');
const ADMIN_DIR    = path.join(__dirname, 'admin');

// ── Security ──────────────────────────────────────────────────────────────────
// contentSecurityPolicy disabled so inline scripts in frontend + admin work
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());

// ── Rate limiting ─────────────────────────────────────────────────────────────
// ONE limiter on /api — do NOT add a separate /api/sync limiter
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

// ── Admin panel — /admin ──────────────────────────────────────────────────────
app.use('/admin', express.static(ADMIN_DIR, { index: 'index.html' }));
app.get('/admin',  (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));
app.get('/admin/', (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));

// ── Health ────────────────────────────────────────────────────────────────────
// Always returns HTTP 200 so Render's healthcheck passes immediately.
// DB status is reported in the body but does NOT affect the status code.
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { if (dbReady) { await pool.query('SELECT 1'); dbOk = true; } } catch (_) {}
  return res.status(200).json({
    status:    dbOk ? 'ok' : 'starting',
    database:  dbOk ? 'connected' : 'connecting',
    ai:        process.env.GEMINI_API_KEY ? 'configured' : 'missing_api_key',
    timestamp: new Date().toISOString(),
    version:   '3.2.0',
  });
});

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

// ── API feature routes ────────────────────────────────────────────────────────
app.use('/api/contracts',      require('./routes/contracts'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/ghost-projects', require('./routes/ghostProjects'));
app.use('/api/ai',             require('./routes/ai'));
app.use('/api/chatbot',        require('./routes/chatbot'));
app.use('/api/sync',           require('./routes/ocdsSync'));

// ── Frontend — serve React/HTML app for ALL non-API, non-admin routes ─────────
// This MUST come after all API and admin routes.
// It serves index.html for any path that isn't an API or admin route,
// enabling client-side routing (SPA pattern).
app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res) => {
  // Only serve index.html for paths that aren't files
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// ── Startup: listen FIRST, DB in background ───────────────────────────────────
// listen() is called before initDB() so Render's healthcheck always gets
// a 200 immediately. DB connects in the background without blocking.
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 KenyaWatch AI v3.2 on port ' + PORT);
  console.log('🌐 Frontend : /  (served from ' + FRONTEND_DIR + ')');
  console.log('🖥  Admin   : /admin');
  console.log('🔧 API      : /api/*');
  console.log('🤖 AI       : ' + (process.env.GEMINI_API_KEY ? 'READY' : '⚠  Set GEMINI_API_KEY in Render Environment'));
  console.log('🗄  DB       : ' + (process.env.DATABASE_URL ? 'connecting...' : '⚠  Set DATABASE_URL in Render Environment'));

  initDB()
    .then(() => {
      dbReady = true;
      console.log('✅ Database ready — all routes operational');
    })
    .catch((e) => {
      // Server stays up. /health stays 200. DB routes return 500 until reconnected.
      console.error('⚠  DB init failed:', e.message);
    });
});
