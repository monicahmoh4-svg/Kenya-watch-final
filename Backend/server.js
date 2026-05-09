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

// ── SSE notification clients ──────────────────────────────────────────────────
const sseClients = new Set();

function broadcastNotification(event, data) {
  const payload = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  sseClients.forEach(client => {
    try { client.write(payload); } catch (_) { sseClients.delete(client); }
  });
}

// Export so routes can use it
app.locals.broadcast = broadcastNotification;

// ── Paths ─────────────────────────────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'public');
const ADMIN_DIR    = path.join(__dirname, 'admin');

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/ai',      rateLimit({ windowMs: 60000, max: 40,  standardHeaders: true, legacyHeaders: false }));
app.use('/api/chatbot', rateLimit({ windowMs: 60000, max: 40,  standardHeaders: true, legacyHeaders: false }));
app.use('/api',         rateLimit({ windowMs: 60000, max: 500, standardHeaders: true, legacyHeaders: false }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logger ────────────────────────────────────────────────────────────────────
app.use((req, _res, next) => { console.log(req.method + ' ' + req.path); next(); });

// ── Admin panel ───────────────────────────────────────────────────────────────
app.use('/admin', express.static(ADMIN_DIR, { index: 'index.html' }));
app.get('/admin',  (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));
app.get('/admin/', (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { if (dbReady) { await pool.query('SELECT 1'); dbOk = true; } } catch (_) {}
  return res.status(200).json({
    status:    dbOk ? 'ok' : 'starting',
    database:  dbOk ? 'connected' : 'connecting',
    ai:        process.env.GEMINI_API_KEY ? 'configured' : 'missing_api_key',
    maps:      process.env.GOOGLE_MAPS_API_KEY ? 'configured' : 'missing',
    timestamp: new Date().toISOString(),
    version:   '3.3.0',
  });
});

// ── Server-Sent Events — live notifications ───────────────────────────────────
// Frontend connects to this endpoint to receive real-time contract alerts
app.get('/api/notifications/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send initial connected event
  res.write('event: connected\ndata: {"message":"KenyaWatch live feed connected"}\n\n');

  // Keep alive ping every 25s
  const ping = setInterval(() => {
    try { res.write('event: ping\ndata: {"ts":' + Date.now() + '}\n\n'); }
    catch (_) { clearInterval(ping); }
  }, 25000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

// ── Root — intentionally no GET / handler ────────────────────────────────────
// The express.static(FRONTEND_DIR) below serves index.html for GET /
// and GET * serves index.html for all other SPA routes.
// Having a GET / handler here would intercept before static files load.

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/stats', async (_req, res) => {
  try {
    const [c, r, g] = await Promise.all([
      pool.query(`SELECT COUNT(*) FILTER (WHERE risk_level='HIGH') AS flagged, COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS funds, COUNT(*) AS total FROM contracts`),
      pool.query(`SELECT COUNT(*) AS total FROM reports WHERE created_at > NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE detection_status IN ('ghost','partial')) AS cnt FROM ghost_projects`),
    ]);
    return res.json({ success: true, data: {
      contracts_flagged: parseInt(c.rows[0].flagged) || 0,
      contracts_total:   parseInt(c.rows[0].total)   || 0,
      ghost_projects:    parseInt(g.rows[0].cnt)     || 0,
      reports_30d:       parseInt(r.rows[0].total)   || 0,
      funds_at_risk:     parseInt(c.rows[0].funds)   || 0,
    }});
  } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

// ── Feature routes ────────────────────────────────────────────────────────────
app.use('/api/contracts',      require('./routes/contracts'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/ghost-projects', require('./routes/ghostProjects'));
app.use('/api/ai',             require('./routes/ai'));
app.use('/api/chatbot',        require('./routes/chatbot'));
app.use('/api/sync',           require('./routes/ocdsSync'));

// ── Serve frontend SPA ────────────────────────────────────────────────────────
app.use(express.static(FRONTEND_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (!res.headersSent) res.status(err.status || 500).json({ success: false, error: err.message });
});

// ── Auto-sync OCDS data every 6 hours ────────────────────────────────────────
function scheduleAutoSync() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(async () => {
    if (!dbReady) return;
    console.log('⏰ Auto-sync: fetching latest PPIP OCDS contracts...');
    try {
      const year = new Date().getFullYear();
      // Create log entry
      const { rows } = await pool.query(
        "INSERT INTO ocds_sync_log (year, status) VALUES ($1,'running') RETURNING id",
        [year]
      );
      const logId = rows[0].id;
      const { fetchAndIngest } = require('./routes/ocdsSync');
      const result = await fetchAndIngest(year, logId);
      await pool.query(
        "UPDATE ocds_sync_log SET status='complete',records=$1,finished_at=NOW() WHERE id=$2",
        [result.inserted, logId]
      );
      if (result.inserted > 0) {
        broadcastNotification('new_contracts', {
          message: result.inserted + ' new contracts imported from PPIP OCDS',
          year,
          count: result.inserted,
          timestamp: new Date().toISOString(),
        });
        console.log('✅ Auto-sync complete: ' + result.inserted + ' contracts imported');
      }
    } catch (e) {
      console.error('Auto-sync error:', e.message);
    }
  }, SIX_HOURS);
  console.log('⏰ Auto-sync scheduled every 6 hours');
}

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 KenyaWatch AI v3.3 on port ' + PORT);
  console.log('🌐 Frontend : /');
  console.log('🖥  Admin   : /admin');
  console.log('📡 SSE feed : /api/notifications/stream');
  console.log('🤖 Gemini  : ' + (process.env.GEMINI_API_KEY ? 'READY' : '⚠  Set GEMINI_API_KEY'));
  console.log('🗺  Maps    : ' + (process.env.GOOGLE_MAPS_API_KEY ? 'READY' : '⚠  Set GOOGLE_MAPS_API_KEY'));
  console.log('🗄  DB      : ' + (process.env.DATABASE_URL ? 'connecting...' : '⚠  Set DATABASE_URL'));

  initDB()
    .then(() => {
      dbReady = true;
      console.log('✅ Database ready');
      scheduleAutoSync();
      // Trigger an initial sync 30s after startup if no contracts exist
      setTimeout(async () => {
        try {
          const { rows } = await pool.query('SELECT COUNT(*) AS n FROM contracts WHERE source=\'ppip_ocds\'');
          if (parseInt(rows[0].n) === 0) {
            console.log('📥 No OCDS contracts yet — triggering initial sync...');
            const year = new Date().getFullYear();
            const { rows: lr } = await pool.query("INSERT INTO ocds_sync_log(year,status) VALUES($1,'running') RETURNING id", [year]);
            const { fetchAndIngest } = require('./routes/ocdsSync');
            fetchAndIngest(year, lr[0].id)
              .then(r => {
                pool.query("UPDATE ocds_sync_log SET status='complete',records=$1,finished_at=NOW() WHERE id=$2", [r.inserted, lr[0].id]).catch(()=>{});
                if (r.inserted > 0) broadcastNotification('new_contracts', { message: r.inserted + ' contracts imported', count: r.inserted, timestamp: new Date().toISOString() });
              })
              .catch(e => console.error('Initial sync error:', e.message));
          }
        } catch (_) {}
      }, 30000);
    })
    .catch(e => console.error('⚠  DB init failed:', e.message));
});

module.exports = { broadcastNotification };
