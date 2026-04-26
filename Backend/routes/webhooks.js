'use strict';
const router = require('express').Router();
const { pool } = require('../db');
const crypto = require('crypto');

// ── IP whitelist middleware ────────────────────────────────────────────────────
// Allows requests from Render IP ranges (74.220.48.0/24 and 74.220.56.0/24)
// and from localhost for development/testing.
const verifyRenderIP = (req, res, next) => {
  const raw = req.ip || req.connection.remoteAddress || '';
  // Strip IPv6-mapped IPv4 prefix (e.g. "::ffff:74.220.48.5" → "74.220.48.5")
  const clientIP = raw.replace(/^::ffff:/, '');

  // Always allow loopback for local dev / Railway internal health checks
  if (clientIP === '127.0.0.1' || clientIP === 'localhost' || clientIP === '::1') {
    return next();
  }

  // Check Render IP ranges: 74.220.48.0/24 and 74.220.56.0/24
  const inRange = (ip, base) => {
    const parts = ip.split('.').map(Number);
    const baseParts = base.split('.').map(Number);
    return (
      parts[0] === baseParts[0] &&
      parts[1] === baseParts[1] &&
      parts[2] === baseParts[2] &&
      parts[3] >= 0 &&
      parts[3] <= 255
    );
  };

  const allowed =
    inRange(clientIP, '74.220.48.0') ||
    inRange(clientIP, '74.220.56.0');

  if (!allowed) {
    console.warn(`⛔ Webhook rejected — IP not whitelisted: ${clientIP}`);
    return res.status(403).json({ success: false, error: 'IP not whitelisted' });
  }

  console.log(`✅ Webhook request from Render IP: ${clientIP}`);
  next();
};

// ── Signature verification middleware ─────────────────────────────────────────
// Validates the HMAC-SHA256 signature sent in the X-Webhook-Signature header.
// Signature verification is skipped when RENDER_WEBHOOK_SECRET is not set
// (falls back to logging-only mode so the endpoint still works during setup).
const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.RENDER_WEBHOOK_SECRET;

  if (!secret) {
    // Secret not configured — warn and continue (useful during initial setup)
    if (!signature) {
      console.warn('⚠  Webhook received without signature and RENDER_WEBHOOK_SECRET is not set');
    }
    return next();
  }

  if (!signature) {
    return res.status(401).json({ success: false, error: 'Missing X-Webhook-Signature header' });
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    console.warn('⛔ Webhook rejected — invalid signature');
    return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
  }

  next();
};

// ── POST /api/webhooks/render ─────────────────────────────────────────────────
// Receives webhook events from the Render service and dispatches them to the
// appropriate handler based on the event type.
router.post('/render', verifyRenderIP, verifyWebhookSignature, async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;

    if (!event) {
      return res.status(400).json({ success: false, error: 'Missing event field in payload' });
    }

    console.log(`📨 Webhook received: ${event} at ${timestamp || new Date().toISOString()}`);

    switch (event) {
      case 'contract.created':
        await handleContractCreated(data);
        break;
      case 'contract.updated':
        await handleContractUpdated(data);
        break;
      case 'report.submitted':
        await handleReportSubmitted(data);
        break;
      case 'sync.request':
        await handleSyncRequest(data);
        break;
      default:
        console.warn(`⚠  Unknown webhook event type: ${event}`);
    }

    res.json({
      success: true,
      message: `Event '${event}' processed successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Webhook processing error:', e.message);
    res.status(500).json({
      success: false,
      error: e.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ── GET /api/webhooks/status ──────────────────────────────────────────────────
// Health check for the webhook integration — returns DB contract count so
// Render can confirm the Railway service is reachable and the DB is live.
router.get('/status', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM contracts');
    res.json({
      success: true,
      status: 'healthy',
      contracts_count: parseInt(rows[0].count),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});

// ── Event handlers ────────────────────────────────────────────────────────────

const handleContractCreated = async (data) => {
  if (!data || !data.contract_id) throw new Error('contract.created: missing contract_id in data');
  const { contract_id, description, county, value, supplier, sector } = data;
  await pool.query(
    `INSERT INTO contracts (contract_id, description, county, sector, value, supplier)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (contract_id) DO NOTHING`,
    [contract_id, description || '', county || null, sector || null, value || 0, supplier || null]
  );
  console.log(`✅ contract.created handled: ${contract_id}`);
};

const handleContractUpdated = async (data) => {
  if (!data || !data.contract_id) throw new Error('contract.updated: missing contract_id in data');
  const { contract_id, ...updates } = data;
  // Only update columns that are actually present in the payload
  const allowed = ['description', 'county', 'sector', 'value', 'supplier', 'status', 'risk_score', 'risk_level'];
  const fields = Object.keys(updates).filter(k => allowed.includes(k));
  if (!fields.length) {
    console.warn(`contract.updated: no recognised fields to update for ${contract_id}`);
    return;
  }
  const setClauses = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [contract_id, ...fields.map(k => updates[k])];
  await pool.query(
    `UPDATE contracts SET ${setClauses}, updated_at = NOW() WHERE contract_id = $1`,
    values
  );
  console.log(`✅ contract.updated handled: ${contract_id}`);
};

const handleReportSubmitted = async (data) => {
  if (!data) throw new Error('report.submitted: missing data payload');
  const { type, county, sector, description, amount } = data;
  if (!type || !description) throw new Error('report.submitted: type and description are required');
  const caseNumber = `KW-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;
  await pool.query(
    `INSERT INTO reports (case_number, type, county, sector, description, amount)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [caseNumber, type, county || null, sector || null, description, amount ? parseInt(amount) : null]
  );
  console.log(`✅ report.submitted handled: ${caseNumber}`);
};

const handleSyncRequest = async (data) => {
  console.log('🔄 sync.request received from Render:', JSON.stringify(data));
  // Placeholder — extend with full sync logic as the integration matures
};

module.exports = router;
