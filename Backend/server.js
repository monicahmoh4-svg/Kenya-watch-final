require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const path     = require('path');
const rateLimit = require('express-rate-limit');
const { initDB, pool } = require('./db');
const { logger, errorHandler, notFound } = require('./middleware');

const app  = express();
// Trust Railway proxy
app.set('trust proxy', 1);

// Validate required environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠️  WARNING: ANTHROPIC_API_KEY not set — AI features will be unavailable');
}
const PORT = process.env.PORT || 5000;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/ai', rateLimit({ windowMs: 60000, max: 30, message: { success: false, error: 'Too many AI requests — wait 60 seconds' } }));
app.use('/api',    rateLimit({ windowMs: 60000, max: 300 }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logger ────────────────────────────────────────────────────────────
app.use(logger);

// ── Admin panel static files ──────────────────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch {}
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    ai: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing_api_key',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'KenyaWatch AI Backend',
    version: '2.0.0',
    description: 'AI-powered anti-corruption intelligence platform for Kenya',
    admin: '/admin',
    health: '/health',
    endpoints: {
      contracts: {
        'GET  /api/contracts':              'List with filters, pagination, sorting',
        'GET  /api/contracts/analytics':    'Risk distribution, county & sector breakdown',
        'GET  /api/contracts/search':       'Full-text search',
        'GET  /api/contracts/:id':          'Single contract + supplier history',
        'POST /api/contracts':              'Create with AI risk scoring',
        'PUT  /api/contracts/:id':          'Update with re-scoring',
        'DELETE /api/contracts/:id':        'Delete',
      },
      reports: {
        'GET  /api/reports':                'List with filters',
        'GET  /api/reports/analytics':      'Statistics by status, type, county',
        'GET  /api/reports/:id':            'Single report',
        'POST /api/reports':               'Submit with AI credibility scoring',
        'PUT  /api/reports/:id':            'Update',
        'PATCH /api/reports/:id/status':   'Update status',
        'DELETE /api/reports/:id':          'Delete',
      },
      ghost_projects: {
        'GET  /api/ghost-projects':         'List with filters',
        'GET  /api/ghost-projects/analytics':'Detection stats',
        'GET  /api/ghost-projects/:id':     'Single + satellite analysis',
        'POST /api/ghost-projects':         'Create with auto satellite analysis',
        'PUT  /api/ghost-projects/:id':     'Update + re-analyse',
        'DELETE /api/ghost-projects/:id':   'Delete',
      },
      ai: {
        'POST /api/ai/chat':                'Claude AI chat with live DB context',
        'POST /api/ai/analyse-contract':    'Deep AI analysis of specific contract',
        'GET  /api/ai/history/:session_id': 'Chat history',
      },
      other: {
        'GET  /api/stats':                  'Dashboard statistics',
      },
    },
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/contracts',      require('./routes/contracts'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/ghost-projects', require('./routes/ghostProjects'));
app.use('/api/ai',             require('./routes/ai'));

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res, next) => {
  try {
    const [c, r, g] = await Promise.all([
      pool.query(`SELECT COUNT(*) FILTER (WHERE risk_level='HIGH') AS flagged, COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS funds, COUNT(*) AS total FROM contracts`),
      pool.query(`SELECT COUNT(*) AS total FROM reports WHERE created_at > NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE detection_status IN ('ghost','partial')) AS cnt FROM ghost_projects`),
    ]);
    res.json({
      success: true,
      data: {
        contracts_flagged: parseInt(c.rows[0].flagged),
        contracts_total:   parseInt(c.rows[0].total),
        ghost_projects:    parseInt(g.rows[0].cnt),
        reports_30d:       parseInt(r.rows[0].total),
        funds_at_risk:     parseInt(c.rows[0].funds),
      },
    });
  } catch (err) { next(err); }
});

// ── Error handlers ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 KenyaWatch AI v2.0 running on port ${PORT}`);
      console.log(`📋 Endpoints: http://localhost:${PORT}/`);
      console.log(`🛠  Admin: http://localhost:${PORT}/admin`);
      console.log(`🤖 AI: ${process.env.ANTHROPIC_API_KEY ? 'configured' : '⚠️  ANTHROPIC_API_KEY not set'}`);
    });
  } catch (err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
};

start();
