'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const { initDB } = require('./db');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/ai', rateLimit({
  windowMs: 60_000,
  max: 20,
  message: { success: false, error: 'Too many AI requests — please wait 60 seconds', code: 'RATE_LIMITED' }
}));
app.use('/api', rateLimit({
  windowMs: 60_000,
  max: 300,
  message: { success: false, error: 'Too many requests — please slow down', code: 'RATE_LIMITED' }
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logging middleware ────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    if (req.path !== '/health') {
      console.log(`[${level}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// ── Serve admin panel ─────────────────────────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const { pool } = require('./db');
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '2.0.0'
    });
  } catch (e) {
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: e.message
    });
  }
});

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'KenyaWatch API',
    description: 'AI-powered government contract and corruption monitoring system for Kenya',
    version: '2.0.0',
    admin: '/admin',
    endpoints: {
      'GET  /health':                        'Health check + DB status',
      'GET  /api/stats':                     'Dashboard statistics',
      'GET  /api/contracts':                 'List contracts (filter: county, risk_level, sector, search)',
      'GET  /api/contracts/analytics':       'Risk distribution, county & supplier breakdown',
      'GET  /api/contracts/search':          'Advanced multi-field search',
      'GET  /api/contracts/:id':             'Single contract with supplier history',
      'POST /api/contracts':                 'Create contract with AI risk scoring',
      'POST /api/contracts/scan':            'Scan & upsert contract (admin panel)',
      'PUT  /api/contracts/:id':             'Update contract',
      'DELETE /api/contracts/:id':           'Delete contract',
      'GET  /api/reports':                   'List reports (filter: status, type, county, sector)',
      'GET  /api/reports/analytics':         'Report statistics by type, county, sector',
      'GET  /api/reports/:id':               'Single report',
      'POST /api/reports':                   'Submit report with AI credibility scoring',
      'PUT  /api/reports/:id':               'Update report',
      'PATCH /api/reports/:id/status':       'Update report status',
      'DELETE /api/reports/:id':             'Delete report',
      'GET  /api/ghost-projects':            'List ghost projects (filter: status, county)',
      'GET  /api/ghost-projects/analytics':  'Detection statistics',
      'GET  /api/ghost-projects/:id':        'Single project with satellite analysis',
      'POST /api/ghost-projects':            'Create ghost project with auto satellite analysis',
      'PUT  /api/ghost-projects/:id':        'Update ghost project',
      'DELETE /api/ghost-projects/:id':      'Delete ghost project',
      'POST /api/ai/chat':                   'AI investigator chat (Claude)',
      'POST /api/ai/analyse-contract':       'Deep AI contract analysis',
      'GET  /api/ai/history/:session_id':    'Chat history'
    }
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/contracts',      require('./routes/contracts'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/ghost-projects', require('./routes/ghostProjects'));
app.use('/api/ai',             require('./routes/ai'));

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const { pool } = require('./db');
  try {
    const [c, r, g] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS flagged,
          COALESCE(SUM(value) FILTER (WHERE risk_level = 'HIGH'), 0) AS funds
        FROM contracts
      `),
      pool.query(`
        SELECT COUNT(*) AS total FROM reports
        WHERE created_at > NOW() - INTERVAL '30 days'
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE detection_status IN ('ghost','partial')) AS cnt
        FROM ghost_projects
      `)
    ]);
    res.json({
      success: true,
      data: {
        contracts_flagged: parseInt(c.rows[0].flagged),
        ghost_projects:    parseInt(g.rows[0].cnt),
        reports_30d:       parseInt(r.rows[0].total),
        funds_at_risk:     parseInt(c.rows[0].funds)
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Error handlers ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 KenyaWatch v2.0 running on port ${PORT}`);
      console.log(`🛠  Admin panel: http://localhost:${PORT}/admin`);
      console.log(`📡 API docs:    http://localhost:${PORT}/`);
    });
  } catch (err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
};

start();
