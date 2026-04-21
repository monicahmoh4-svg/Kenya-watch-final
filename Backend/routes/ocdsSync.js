'use strict';
/**
 * KenyaWatch AI — OCDS Sync Route
 * Imports real Kenya government contracts from the PPRA Public Procurement
 * Information Portal (tenders.go.ke) via the OCP Data Registry.
 *
 * Data source: https://data.open-contracting.org/en/publication/147
 * Format: JSONL (one JSON object per line), Gzip compressed
 * Coverage: 105,738+ contracts, Jul 2018–present, all 47 counties
 * Legal basis: Executive Order No. 2 of 2018
 */

const router = require('express').Router();
const https  = require('https');
const http   = require('http');
const zlib   = require('zlib');
const { pool } = require('../db');

// ── Ensure ocds_sync_log table exists when this module loads ─────────────────
// This runs once at startup — guarantees the table is always present
// before any route handler tries to use it.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ocds_sync_log (
        id          SERIAL PRIMARY KEY,
        year        INTEGER,
        status      VARCHAR(20)  DEFAULT 'pending',
        records     INTEGER      DEFAULT 0,
        error_msg   TEXT,
        started_at  TIMESTAMPTZ  DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);
    console.log('✅ ocds_sync_log table ready');
  } catch (e) {
    console.error('⚠  ocds_sync_log table init error:', e.message);
  }
})();

// ── All 47 county keyword maps ────────────────────────────────────────────────
const COUNTY_MAP = {
  'Nairobi':          ['nairobi','city county','upper hill','westlands','kibera','langata','kasarani','embakasi','ncc'],
  'Mombasa':          ['mombasa','kilindini','mvita','likoni','changamwe','port reitz'],
  'Kisumu':           ['kisumu','nyanza','winam'],
  'Nakuru':           ['nakuru','naivasha','gilgil'],
  'Kiambu':           ['kiambu','thika','ruiru','gatundu','limuru'],
  'Kisii':            ['kisii','gusii'],
  'Kakamega':         ['kakamega','mumias'],
  'Meru':             ['meru county','meru '],
  'Kilifi':           ['kilifi','malindi','kaloleni'],
  'Kwale':            ['kwale','msambweni','matuga','kinango'],
  'Wajir':            ['wajir'],
  'Mandera':          ['mandera'],
  'Marsabit':         ['marsabit','moyale'],
  'Turkana':          ['turkana','lodwar'],
  'Garissa':          ['garissa'],
  'Tana River':       ['tana river','hola','garsen'],
  'Lamu':             ['lamu'],
  'Baringo':          ['baringo','kabarnet','eldama'],
  'Bomet':            ['bomet'],
  'Busia':            ['busia'],
  'Elgeyo Marakwet':  ['elgeyo','marakwet','iten'],
  'Embu':             ['embu'],
  'Homa Bay':         ['homa bay','homabay'],
  'Isiolo':           ['isiolo'],
  'Kajiado':          ['kajiado','ngong'],
  'Kericho':          ['kericho'],
  'Kirinyaga':        ['kirinyaga','kerugoya'],
  'Kitui':            ['kitui'],
  'Laikipia':         ['laikipia','nyahururu'],
  'Machakos':         ['machakos'],
  'Makueni':          ['makueni','wote'],
  "Murang'a":         ["murang'a",'muranga','kangema'],
  'Narok':            ['narok'],
  'Nandi':            ['nandi','kapsabet'],
  'Nyandarua':        ['nyandarua','ol kalou'],
  'Nyamira':          ['nyamira'],
  'Nyeri':            ['nyeri'],
  'Samburu':          ['samburu','maralal'],
  'Siaya':            ['siaya'],
  'Taita Taveta':     ['taita','taveta','wundanyi'],
  'Tharaka Nithi':    ['tharaka nithi','chuka'],
  'Trans Nzoia':      ['trans nzoia','kitale'],
  'Uasin Gishu':      ['uasin gishu','eldoret'],
  'Vihiga':           ['vihiga'],
  'West Pokot':       ['west pokot','kapenguria'],
  'National':         ['national','republic of kenya','government of kenya','ministry','state department','national treasury'],
};

const SECTOR_MAP = {
  'Roads':         ['road','highway','bridge','bypass','tarmac','rehabilitation','pavement','culvert','drainage','carriageway'],
  'Health':        ['hospital','clinic','dispensary','medical','health','nhif','kemsa','pharmacy','drug','theatre','ward','ambulance'],
  'Education':     ['school','college','university','tvet','classroom','laboratory','library','bursary','exam','pupil'],
  'Water':         ['water','sewerage','borehole','irrigation','dam','pipeline','sanitation','treatment','kiosk'],
  'Agriculture':   ['agriculture','farming','fertilizer','seed','livestock','irrigation','subsidy','grain','maize','crop'],
  'ICT':           ['ict','software','system','digital','computer','network','platform','database','application','portal'],
  'Security':      ['police','security','cctv','surveillance','defence','military','firearm'],
  'Infrastructure':['construction','building','market','hall','office','housing','warehouse','stadium','fence'],
  'Energy':        ['electricity','solar','power','energy','transformer','generator','grid','ketraco','kplc'],
  'Transport':     ['transport','vehicle','bus','airport','railway','port','logistics','fleet'],
};

function inferCounty(text) {
  const t = (text || '').toLowerCase();
  for (const [county, keys] of Object.entries(COUNTY_MAP)) {
    if (keys.some(k => t.includes(k))) return county;
  }
  return 'National';
}

function inferSector(text) {
  const t = (text || '').toLowerCase();
  for (const [sector, keys] of Object.entries(SECTOR_MAP)) {
    if (keys.some(k => t.includes(k))) return sector;
  }
  return 'Infrastructure';
}

function scoreRisk(value, bid_type) {
  let score = 0;
  const flags = [];
  const methodScores = { single_source: 30, direct: 28, restricted: 15, emergency: 10, negotiated: 8, open: 0 };
  score += methodScores[bid_type] || 0;

  if (bid_type === 'single_source' || bid_type === 'direct') {
    flags.push('Single-source / direct award — no competitive bidding');
  } else if (bid_type === 'restricted') {
    flags.push('Restricted bidding');
  }

  const v = parseInt(value) || 0;
  if (v >= 5000000000)  { score += 20; flags.push(`Extremely high value — KES ${(v/1e9).toFixed(1)}B`); }
  else if (v >= 1000000000 && bid_type !== 'open') { score += 18; flags.push(`KES ${(v/1e9).toFixed(1)}B via non-open process`); }
  else if (v >= 500000000  && (bid_type === 'single_source' || bid_type === 'direct')) { score += 22; flags.push(`KES ${(v/1e6).toFixed(0)}M single-source`); }

  score = Math.min(Math.max(score, 0), 100);
  const risk_level = score >= 75 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  if (!flags.length) flags.push('No significant fraud indicators detected');
  return { score, risk_level, flags };
}

function parseOCDSRecord(record) {
  try {
    const ocid = (record.ocid || '').trim();
    if (!ocid) return null;

    const releases = Array.isArray(record.releases) ? record.releases : [record];
    let description = '', supplier = '', value = 0, bid_type = 'open';
    let awarded_date = null, procuring_entity = '';

    for (const r of releases) {
      // Tender info
      if (r.tender) {
        if (!description) description = (r.tender.title || r.tender.description || '').trim();
        if (!procuring_entity) {
          procuring_entity = (
            (r.buyer && r.buyer.name) ||
            (r.tender.procuringEntity && r.tender.procuringEntity.name) || ''
          ).trim();
        }
        const pm = (r.tender.procurementMethod || r.tender.procurementMethodDetails || '').toLowerCase();
        if      (pm.includes('single') || pm.includes('direct'))     bid_type = 'single_source';
        else if (pm.includes('restrict'))                             bid_type = 'restricted';
        else if (pm.includes('emergency'))                            bid_type = 'emergency';
        else if (pm.includes('negotiat'))                             bid_type = 'negotiated';
      }
      // Awards
      if (!supplier && r.awards && r.awards.length > 0) {
        const aw = r.awards[0];
        if (aw.suppliers && aw.suppliers.length > 0) supplier = (aw.suppliers[0].name || '').trim();
        if (!value && aw.value && aw.value.amount) {
          value = Math.round(parseFloat(aw.value.amount) || 0);
          const cur = (aw.value.currency || 'KES').toUpperCase();
          if      (cur === 'USD') value = Math.round(value * 130);
          else if (cur === 'EUR') value = Math.round(value * 140);
          else if (cur === 'GBP') value = Math.round(value * 165);
        }
        if (!awarded_date && aw.date) awarded_date = aw.date.slice(0, 10);
      }
      // Contracts
      if (r.contracts && r.contracts.length > 0) {
        const co = r.contracts[0];
        if (!awarded_date && co.dateSigned) awarded_date = co.dateSigned.slice(0, 10);
        if (!value && co.value && co.value.amount) value = Math.round(parseFloat(co.value.amount) || 0);
      }
      if (!procuring_entity && r.buyer && r.buyer.name) procuring_entity = r.buyer.name.trim();
    }

    if (!description || description.length < 4) return null;

    const searchText = description + ' ' + procuring_entity;
    const county     = inferCounty(searchText);
    const sector     = inferSector(description);
    const contract_id = ('OCDS-' + ocid.replace(/[^a-zA-Z0-9-]/g, '-')).slice(0, 100);
    const { score, risk_level, flags } = scoreRisk(value, bid_type);

    return {
      contract_id,
      description:      description.slice(0, 500),
      county,
      sector,
      value,
      supplier:         (supplier || 'Unknown Supplier').slice(0, 200),
      bid_type,
      awarded_date:     awarded_date || null,
      risk_score:       score,
      risk_level,
      flags:            JSON.stringify(flags),
      procuring_entity: procuring_entity.slice(0, 200),
      ocds_ocid:        ocid.slice(0, 100),
      source:           'ppip_ocds',
    };
  } catch (_) {
    return null;
  }
}

async function insertBatch(records) {
  if (!records.length) return 0;
  let count = 0;
  let client;
  try {
    client = await pool.connect();
    for (const r of records) {
      try {
        await client.query(
          `INSERT INTO contracts
             (contract_id, description, county, sector, value, supplier,
              bid_type, awarded_date, risk_score, risk_level, flags,
              procuring_entity, ocds_ocid, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (contract_id) DO UPDATE SET
             description      = EXCLUDED.description,
             risk_score       = EXCLUDED.risk_score,
             risk_level       = EXCLUDED.risk_level,
             flags            = EXCLUDED.flags`,
          [
            r.contract_id, r.description, r.county, r.sector,
            r.value, r.supplier, r.bid_type, r.awarded_date,
            r.risk_score, r.risk_level, r.flags,
            r.procuring_entity, r.ocds_ocid, r.source,
          ]
        );
        count++;
      } catch (_) { /* skip bad rows silently */ }
    }
  } finally {
    if (client) client.release();
  }
  return count;
}

// ── Stream-parse the OCDS JSONL.GZ file ──────────────────────────────────────
function fetchAndIngest(year, logId) {
  return new Promise((resolve, reject) => {
    const url = `https://data.open-contracting.org/en/publication/147/download?name=${year}.jsonl.gz`;
    console.log(`📥 OCDS ${year}: starting download from OCP registry...`);

    function doRequest(targetUrl, redirectCount) {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      const mod = targetUrl.startsWith('https') ? https : http;
      const req = mod.get(targetUrl, { timeout: 180000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          res.resume(); // drain
          return doRequest(loc, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} from OCDS source`));
        }
        streamParse(res, resolve, reject, year, logId);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout — try again')); });
    }

    doRequest(url, 0);
  });
}

function streamParse(res, resolve, reject, year, logId) {
  const gunzip = zlib.createGunzip();
  res.pipe(gunzip);
  gunzip.setEncoding('utf8');

  let buffer   = '';
  let inserted = 0;
  let parsed   = 0;
  let errors   = 0;
  let batch    = [];
  const BATCH  = 50;
  let flushing = false;

  async function flushBatch() {
    if (flushing || !batch.length) return;
    flushing = true;
    const rows = batch.splice(0);
    try {
      const n = await insertBatch(rows);
      inserted += n;
      // Update log record count periodically so the UI can show progress
      pool.query(
        'UPDATE ocds_sync_log SET records = $1 WHERE id = $2',
        [inserted, logId]
      ).catch(() => {});
    } catch (_) {}
    flushing = false;
  }

  gunzip.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the incomplete last line

    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      try {
        const rec = parseOCDSRecord(JSON.parse(l));
        if (rec) { batch.push(rec); parsed++; }
      } catch (_) { errors++; }

      if (batch.length >= BATCH) {
        gunzip.pause();
        flushBatch().then(() => gunzip.resume()).catch(() => gunzip.resume());
      }
    }
  });

  gunzip.on('end', async () => {
    // Handle last partial line
    if (buffer.trim()) {
      try {
        const rec = parseOCDSRecord(JSON.parse(buffer.trim()));
        if (rec) batch.push(rec);
      } catch (_) {}
    }
    await flushBatch();
    console.log(`✅ OCDS ${year}: ${parsed} parsed, ${inserted} inserted, ${errors} errors`);
    resolve({ year, parsed, inserted, errors });
  });

  gunzip.on('error', reject);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/sync/ocds
 * Body: { year: 2025 }
 *
 * The key fix: res.json() is called FIRST, then the sync runs in setImmediate()
 * so the response is never blocked and headers can never be written twice.
 */
router.post('/ocds', (req, res) => {
  // Parse year before doing any async work
  const year = parseInt((req.body && req.body.year) || new Date().getFullYear());

  if (!year || year < 2018 || year > new Date().getFullYear()) {
    return res.status(400).json({
      success: false,
      error: `Invalid year. Must be between 2018 and ${new Date().getFullYear()}.`,
    });
  }

  // Insert the log row, then respond, then sync — all in one clean flow
  pool.query(
    'INSERT INTO ocds_sync_log (year, status) VALUES ($1, $2) RETURNING id',
    [year, 'running']
  )
  .then(({ rows }) => {
    const logId = rows[0].id;

    // ✅ Send response IMMEDIATELY — before any async work
    res.json({
      success: true,
      message: `OCDS sync started for year ${year}. Running in background. Refresh Status in 3–5 minutes.`,
      log_id:  logId,
      year,
    });

    // ✅ Run sync AFTER response is sent, completely detached
    setImmediate(() => {
      fetchAndIngest(year, logId)
        .then((result) => {
          return pool.query(
            'UPDATE ocds_sync_log SET status = $1, records = $2, finished_at = NOW() WHERE id = $3',
            ['complete', result.inserted, logId]
          );
        })
        .then(() => console.log(`✅ Sync ${year} complete`))
        .catch((err) => {
          console.error(`❌ Sync ${year} failed:`, err.message);
          return pool.query(
            'UPDATE ocds_sync_log SET status = $1, error_msg = $2, finished_at = NOW() WHERE id = $3',
            ['failed', err.message, logId]
          ).catch(() => {});
        });
    });
  })
  .catch((err) => {
    console.error('Sync log insert error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});

/**
 * GET /api/sync/status
 */
router.get('/status', (req, res) => {
  Promise.all([
    pool.query('SELECT * FROM ocds_sync_log ORDER BY started_at DESC LIMIT 10'),
    pool.query('SELECT source, COUNT(*) AS count FROM contracts GROUP BY source ORDER BY count DESC'),
    pool.query('SELECT COUNT(*) AS total FROM contracts'),
  ])
  .then(([logsRes, countsRes, totalRes]) => {
    return res.json({
      success: true,
      data: {
        sync_logs:       logsRes.rows,
        by_source:       countsRes.rows,
        total_contracts: parseInt(totalRes.rows[0].total) || 0,
      },
    });
  })
  .catch((err) => {
    console.error('Status route error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  });
});

/**
 * GET /api/sync/counties
 */
router.get('/counties', (req, res) => {
  pool.query(`
    SELECT
      county,
      COUNT(*)                                                              AS total,
      COUNT(*) FILTER (WHERE risk_level = 'HIGH')                          AS high_risk,
      COUNT(*) FILTER (WHERE risk_level = 'MEDIUM')                        AS medium_risk,
      AVG(risk_score)::INT                                                  AS avg_score,
      COALESCE(SUM(value), 0)                                               AS total_value
    FROM contracts
    WHERE county IS NOT NULL
    GROUP BY county
    ORDER BY total DESC
  `)
  .then(({ rows }) => res.json({ success: true, data: rows, total: rows.length }))
  .catch((err) => res.status(500).json({ success: false, error: err.message }));
});

module.exports = router;
