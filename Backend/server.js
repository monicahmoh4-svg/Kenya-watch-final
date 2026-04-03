require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // disabled for admin panel inline scripts
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE'], allowedHeaders: ['Content-Type'] }));
app.use('/api/ai', rateLimit({ windowMs: 60000, max: 20 }));
app.use('/api',    rateLimit({ windowMs: 60000, max: 200 }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Serve admin panel ─────────────────────────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'KenyaWatch API',
    description: 'Government contract and project monitoring system',
    version: '1.0.0',
    admin: '/admin',
    endpoints: {
      'GET /health':              'Health check',
      'GET /api/stats':           'Dashboard statistics',
      'GET /api/contracts':       'List contracts',
      'POST /api/contracts/scan': 'Scan & add contract',
      'GET /api/reports':         'List reports',
      'POST /api/reports':        'Submit report',
      'PATCH /api/reports/:id/status': 'Update report status',
      'GET /api/ghost-projects':  'List ghost projects',
      'POST /api/ghost-projects': 'Add ghost project',
      'POST /api/ai/chat':        'AI chat'
    }
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/contracts',     require('./routes/contracts'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/ghost-projects',require('./routes/ghostProjects'));
app.use('/api/ai',            require('./routes/ai'));

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const { pool } = require('./db');
  try {
    const [c, r, g] = await Promise.all([
      pool.query(`SELECT COUNT(*) FILTER (WHERE risk_level='HIGH') AS flagged,
                         COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS funds
                  FROM contracts`),
      pool.query(`SELECT COUNT(*) AS total FROM reports
                  WHERE created_at > NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE detection_status IN ('ghost','partial')) AS cnt
                  FROM ghost_projects`)
    ]);
    res.json({ success: true, data: {
      contracts_flagged: parseInt(c.rows[0].flagged),
      ghost_projects:    parseInt(g.rows[0].cnt),
      reports_30d:       parseInt(r.rows[0].total),
      funds_at_risk:     parseInt(c.rows[0].funds)
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Error handlers ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 KenyaWatch running on port ${PORT}`);
      console.log(`🛠  Admin panel: http://localhost:${PORT}/admin`);
    });
  } catch (err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
};

start();
