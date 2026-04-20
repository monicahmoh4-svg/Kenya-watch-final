'use strict';
const router = require('express').Router();
const https  = require('https');
const http   = require('http');
const zlib   = require('zlib');
const { pool } = require('../db');

// ── County keyword mapping (all 47 counties) ──────────────────────────────────
const COUNTY_MAP = {
  'Nairobi':          ['nairobi','ncc','city county','upper hill','westlands','kibera','langata','kasarani','embakasi'],
  'Mombasa':          ['mombasa','coast general','kilindini','mvita','likoni','port reitz','changamwe'],
  'Kisumu':           ['kisumu','nyanza','winam','kisumu county'],
  'Nakuru':           ['nakuru','rift valley','naivasha','gilgil','nakuru county'],
  'Kiambu':           ['kiambu','thika','ruiru','gatundu','limuru','kiambu county'],
  'Kisii':            ['kisii','gusii','kisii county'],
  'Kakamega':         ['kakamega','western','mumias','kakamega county'],
  'Meru':             ['meru','meru county'],
  'Kilifi':           ['kilifi','malindi','kaloleni','kilifi county'],
  'Kwale':            ['kwale','msambweni','matuga','kinango','kwale county'],
  'Wajir':            ['wajir','wajir county'],
  'Mandera':          ['mandera','mandera county'],
  'Marsabit':         ['marsabit','moyale','marsabit county'],
  'Turkana':          ['turkana','lodwar','lokichar','turkana county'],
  'Garissa':          ['garissa','garissa county'],
  'Tana River':       ['tana river','hola','garsen','tana river county'],
  'Lamu':             ['lamu','lamu county'],
  'Baringo':          ['baringo','kabarnet','eldama','baringo county'],
  'Bomet':            ['bomet','bomet county'],
  'Busia':            ['busia','busia county'],
  'Elgeyo Marakwet':  ['elgeyo','marakwet','iten','elgeyo marakwet'],
  'Embu':             ['embu','embu county'],
  'Homa Bay':         ['homa bay','homabay','homa bay county'],
  'Isiolo':           ['isiolo','isiolo county'],
  'Kajiado':          ['kajiado','ngong','kajiado county'],
  'Kericho':          ['kericho','kericho county'],
  'Kirinyaga':        ['kirinyaga','kerugoya','kirinyaga county'],
  'Kitui':            ['kitui','kitui county'],
  'Laikipia':         ['laikipia','nyahururu','laikipia county'],
  'Machakos':         ['machakos','machakos county'],
  'Makueni':          ['makueni','wote','makueni county'],
  "Murang'a":         ["murang'a",'muranga','murangas','kangema',"murang"],
  'Narok':            ['narok','narok county'],
  'Nandi':            ['nandi','kapsabet','nandi county'],
  'Nyandarua':        ['nyandarua','ol kalou','nyandarua county'],
  'Nyamira':          ['nyamira','nyamira county'],
  'Nyeri':            ['nyeri','nyeri county'],
  'Samburu':          ['samburu','maralal','samburu county'],
  'Siaya':            ['siaya','siaya county'],
  'Taita Taveta':     ['taita','taveta','wundanyi','taita taveta'],
  'Tharaka Nithi':    ['tharaka','nithi','chuka','tharaka nithi'],
  'Trans Nzoia':      ['trans nzoia','kitale','trans nzoia county'],
  'Uasin Gishu':      ['uasin gishu','eldoret','uasin gishu county'],
  'Vihiga':           ['vihiga','vihiga county'],
  'West Pokot':       ['west pokot','kapenguria','west pokot county'],
  'National':         ['national','kenya','government of kenya','republic of kenya','national treasury','ministry','state department','national police','kenya national'],
};

const SECTOR_MAP = {
  'Roads':         ['road','highway','bridge','bypass','tarmac','rehabilitation','pavement','culvert','street','drainage','carriageway'],
  'Health':        ['hospital','clinic','dispensary','medical','health','nhif','kemsa','pharmacy','drug','ambulance','theatre','ward'],
  'Education':     ['school','college','university','tvet','classroom','laboratory','library','bursary','exam','pupil','student','teacher'],
  'Water':         ['water','sewerage','borehole','irrigation','dam','pipeline','sanitation','treatment plant','kiosk','water supply'],
  'Agriculture':   ['agriculture','farming','fertilizer','seed','livestock','irrigation','subsidy','grain','maize','dairy','crop'],
  'ICT':           ['ict','software','system','digital','computer','internet','network','platform','database','application','portal','website'],
  'Security':      ['police','security','cctv','surveillance','defence','military','firearm','patrol'],
  'Infrastructure':['construction','building','market','hall','office','housing','warehouse','stadium','fence','gate'],
  'Energy':        ['electricity','solar','power','energy','transformer','generator','grid','ketraco','kplc','renewable'],
  'Transport':     ['transport','vehicle','bus','aircraft','airport','railway','port','logistics','fleet','ambulance'],
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

function scoreRisk({ value, bid_type }) {
  let score = 0;
  const flags = [];
  const bt = { single_source: 30, direct: 28, restricted: 15, emergency: 10, negotiated: 8, open: 0 };
  score += bt[bid_type] || 0;
  if (bid_type === 'single_source' || bid_type === 'direct') flags.push('Single-source/direct award — no competitive bidding');
  else if (bid_type === 'restricted') flags.push('Restricted bidding');

  const v = parseInt(value) || 0;
  if (v >= 5000000000) { score += 20; flags.push('Extremely high value — KES 5B+'); }
  else if (v >= 1000000000 && bid_type !== 'open') { score += 18; flags.push(`KES ${(v/1e9).toFixed(1)}B via non-open process`); }
  else if (v >= 500000000 && (bid_type === 'single_source' || bid_type === 'direct')) { score += 22; flags.push(`KES ${(v/1e6).toFixed(0)}M single-source`); }

  score = Math.min(Math.max(score, 0), 100);
  const risk_level = score >= 75 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  if (!flags.length) flags.push('No significant fraud indicators detected');
  return { score, risk_level, flags };
}

function parseOCDSRecord(record) {
  try {
    const ocid = record.ocid || '';
    if (!ocid) return null;
    const releases = Array.isArray(record.releases) ? record.releases : [record];

    let description = '', supplier = '', value = 0, bid_type = 'open';
    let awarded_date = null, procuring_entity = '';

    for (const r of releases) {
      if (r.tender && !description) {
        description = r.tender.title || r.tender.description || '';
        const pm = ((r.tender.procurementMethod || r.tender.procurementMethodDetails || '')).toLowerCase();
        if (pm.includes('single') || pm.includes('direct')) bid_type = 'single_source';
        else if (pm.includes('restricted')) bid_type = 'restricted';
        else if (pm.includes('emergency')) bid_type = 'emergency';
        else if (pm.includes('negotiated')) bid_type = 'negotiated';
        procuring_entity = procuring_entity || (r.buyer && r.buyer.name) || (r.tender.procuringEntity && r.tender.procuringEntity.name) || '';
      }
      if (r.awards && r.awards.length > 0 && !supplier) {
        const award = r.awards[0];
        if (award.suppliers && award.suppliers.length > 0) supplier = award.suppliers[0].name || '';
        if (!value && award.value && award.value.amount) {
          value = Math.round(parseFloat(award.value.amount) || 0);
          const cur = (award.value.currency || 'KES').toUpperCase();
          if (cur === 'USD') value = Math.round(value * 130);
          else if (cur === 'EUR') value = Math.round(value * 140);
          else if (cur === 'GBP') value = Math.round(value * 165);
        }
        if (!awarded_date && award.date) awarded_date = award.date.slice(0, 10);
      }
      if (r.contracts && r.contracts.length > 0) {
        const c = r.contracts[0];
        if (!awarded_date && c.dateSigned) awarded_date = c.dateSigned.slice(0, 10);
        if (!value && c.value && c.value.amount) value = Math.round(parseFloat(c.value.amount) || 0);
      }
      if (!procuring_entity && r.buyer && r.buyer.name) procuring_entity = r.buyer.name;
    }

    description = (description || '').trim();
    if (description.length < 5) return null;

    const county = inferCounty(description + ' ' + procuring_entity);
    const sector = inferSector(description);
    const contract_id = ('OCDS-' + ocid.replace(/[^a-zA-Z0-9-]/g, '-')).slice(0, 100);
    const { score, risk_level, flags } = scoreRisk({ value, bid_type });

    return {
      contract_id,
      description: description.slice(0, 500),
      county,
      sector,
      value,
      supplier: (supplier || 'Unknown Supplier').slice(0, 200),
      bid_type,
      awarded_date: awarded_date || null,
      risk_score: score,
      risk_level,
      flags: JSON.stringify(flags),
      procuring_entity: (procuring_entity || '').slice(0, 200),
      ocds_ocid: ocid.slice(0, 100),
      source: 'ppip_ocds',
    };
  } catch {
    return null;
  }
}

// ── Insert a batch into contracts table ───────────────────────────────────────
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
             (contract_id,description,county,sector,value,supplier,bid_type,
              awarded_date,risk_score,risk_level,flags,procuring_entity,ocds_ocid,source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (contract_id) DO UPDATE SET
             description=EXCLUDED.description,
             risk_score=EXCLUDED.risk_score,
             risk_level=EXCLUDED.risk_level,
             flags=EXCLUDED.flags`,
          [r.contract_id, r.description, r.county, r.sector, r.value,
           r.supplier, r.bid_type, r.awarded_date, r.risk_score,
           r.risk_level, r.flags, r.procuring_entity, r.ocds_ocid, r.source]
        );
        count++;
      } catch { /* skip bad rows */ }
    }
  } finally {
    if (client) client.release();
  }
  return count;
}

// ── Fetch + stream-parse OCDS JSONL.GZ file ──────────────────────────────────
async function fetchAndIngestOCDS(year, logId) {
  const url = `https://data.open-contracting.org/en/publication/147/download?name=${year}.jsonl.gz`;
  console.log(`📥 OCDS sync: fetching ${year} from OCP registry...`);

  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 180000 }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error('Redirect with no location'));
        const rmod = loc.startsWith('https') ? https : http;
        rmod.get(loc, { timeout: 180000 }, handleStream).on('error', reject);
        return;
      }
      handleStream(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout — try again')); });

    function handleStream(res) {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from OCDS source`));
      }

      const gunzip = zlib.createGunzip();
      res.pipe(gunzip);
      gunzip.setEncoding('utf8');

      let buffer = '';
      let inserted = 0, parsed = 0, errors = 0;
      let batch = [];
      const BATCH_SIZE = 50;

      const flushBatch = async () => {
        if (!batch.length) return;
        const toInsert = batch.splice(0);
        const n = await insertBatch(toInsert).catch(() => 0);
        inserted += n;
        // Update log periodically
        pool.query('UPDATE ocds_sync_log SET records=$1 WHERE id=$2', [inserted, logId]).catch(() => {});
      };

      gunzip.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          const l = line.trim();
          if (!l) continue;
          try {
            const record = JSON.parse(l);
            const parsed_record = parseOCDSRecord(record);
            if (parsed_record) { batch.push(parsed_record); parsed++; }
          } catch { errors++; }

          if (batch.length >= BATCH_SIZE) {
            // Pause, flush, resume
            gunzip.pause();
            flushBatch().then(() => gunzip.resume()).catch(() => gunzip.resume());
          }
        }
      });

      gunzip.on('end', async () => {
        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const record = JSON.parse(buffer.trim());
            const r = parseOCDSRecord(record);
            if (r) batch.push(r);
          } catch {}
        }
        await flushBatch();
        console.log(`✅ OCDS ${year}: ${parsed} parsed, ${inserted} inserted, ${errors} errors`);
        resolve({ year, parsed, inserted, errors });
      });

      gunzip.on('error', reject);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/sync/ocds
// Respond immediately, run sync in background via setImmediate
router.post('/ocds', async (req, res) => {
  try {
    const year = parseInt(req.body && req.body.year) || new Date().getFullYear();
    if (year < 2018 || year > new Date().getFullYear()) {
      return res.status(400).json({ success: false, error: `Year must be 2018–${new Date().getFullYear()}` });
    }

    // Insert log row and get ID
    let logId;
    try {
      const { rows } = await pool.query(
        'INSERT INTO ocds_sync_log (year, status) VALUES ($1, $2) RETURNING id',
        [year, 'running']
      );
      logId = rows[0].id;
    } catch (e) {
      // ocds_sync_log might not exist yet — create and retry
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ocds_sync_log (
          id SERIAL PRIMARY KEY, year INTEGER,
          status VARCHAR(20) DEFAULT 'pending',
          records INTEGER DEFAULT 0,
          started_at TIMESTAMPTZ DEFAULT NOW(),
          finished_at TIMESTAMPTZ
        )
      `).catch(() => {});
      const { rows } = await pool.query(
        'INSERT INTO ocds_sync_log (year, status) VALUES ($1, $2) RETURNING id',
        [year, 'running']
      );
      logId = rows[0].id;
    }

    // ✅ Respond immediately — client gets success before sync starts
    res.json({
      success: true,
      message: `OCDS sync started for year ${year}. This runs in the background — check Refresh Status in 3–5 minutes.`,
      log_id: logId,
      year,
    });

    // Run the actual sync completely detached from the request lifecycle
    setImmediate(async () => {
      try {
        const result = await fetchAndIngestOCDS(year, logId);
        await pool.query(
          'UPDATE ocds_sync_log SET status=$1, records=$2, finished_at=NOW() WHERE id=$3',
          ['complete', result.inserted, logId]
        ).catch(() => {});
        console.log(`✅ Sync ${year} complete: ${result.inserted} contracts inserted`);
      } catch (e) {
        console.error(`❌ Sync ${year} failed:`, e.message);
        await pool.query(
          'UPDATE ocds_sync_log SET status=$1, finished_at=NOW() WHERE id=$2',
          ['failed', logId]
        ).catch(() => {});
      }
    });

  } catch (e) {
    console.error('Sync route error:', e.message);
    // Only send error if headers not already sent
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
});

// GET /api/sync/status
router.get('/status', async (req, res) => {
  try {
    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ocds_sync_log (
        id SERIAL PRIMARY KEY, year INTEGER,
        status VARCHAR(20) DEFAULT 'pending',
        records INTEGER DEFAULT 0,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `).catch(() => {});

    const [logsRes, countsRes, totalRes] = await Promise.all([
      pool.query('SELECT * FROM ocds_sync_log ORDER BY started_at DESC LIMIT 10'),
      pool.query('SELECT source, COUNT(*) AS count FROM contracts GROUP BY source ORDER BY count DESC'),
      pool.query('SELECT COUNT(*) AS total FROM contracts'),
    ]);

    res.json({
      success: true,
      data: {
        sync_logs:       logsRes.rows,
        by_source:       countsRes.rows,
        total_contracts: parseInt(totalRes.rows[0].total),
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/sync/counties — all counties with contract counts
router.get('/counties', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT county,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE risk_level='HIGH')   AS high_risk,
        COUNT(*) FILTER (WHERE risk_level='MEDIUM') AS medium_risk,
        AVG(risk_score)::INT                        AS avg_score,
        COALESCE(SUM(value), 0)                     AS total_value
      FROM contracts
      WHERE county IS NOT NULL
      GROUP BY county
      ORDER BY total DESC
    `);
    res.json({ success: true, data: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
