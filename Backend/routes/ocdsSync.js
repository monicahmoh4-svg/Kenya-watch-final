'use strict';
/**
 * OCDS Sync Route — Ingests real Kenya procurement contracts from PPIP
 * Data source: tenders.go.ke (PPRA PPIP) — Open Contracting Data Standard
 * Fallback: OCP Data Registry downloads
 */
const router  = require('express').Router();
const https   = require('https');
const zlib    = require('zlib');
const { pool } = require('../db');

// ── County keyword mapping ─────────────────────────────────────────────────────
const COUNTY_KEYWORDS = {
  'Nairobi':       ['nairobi','ncc','city county','upper hill','westlands','kibera','langata'],
  'Mombasa':       ['mombasa','coast','kilindini','mvita','likoni','port'],
  'Kisumu':        ['kisumu','nyanza','kisumu county'],
  'Nakuru':        ['nakuru','rift valley','nakuru county'],
  'Kiambu':        ['kiambu','thika','ruiru','kiambu county'],
  'Kisii':         ['kisii','nyamira','kisii county'],
  'Kakamega':      ['kakamega','western','kakamega county'],
  'Meru':          ['meru','meru county'],
  'Kilifi':        ['kilifi','malindi','kilifi county'],
  'Kwale':         ['kwale','kwale county'],
  'Wajir':         ['wajir','wajir county'],
  'Mandera':       ['mandera','mandera county'],
  'Marsabit':      ['marsabit','marsabit county'],
  'Turkana':       ['turkana','lodwar','turkana county'],
  'Garissa':       ['garissa','garissa county'],
  'Tana River':    ['tana river','hola','tana river county'],
  'Lamu':          ['lamu','lamu county'],
  'Baringo':       ['baringo','kabarnet','baringo county'],
  'Bomet':         ['bomet','bomet county'],
  'Busia':         ['busia','busia county'],
  'Elgeyo Marakwet':['elgeyo','marakwet','iten','elgeyo marakwet'],
  'Embu':          ['embu','embu county'],
  'Homa Bay':      ['homa bay','homa bay county'],
  'Isiolo':        ['isiolo','isiolo county'],
  'Kajiado':       ['kajiado','ngong','kajiado county'],
  'Kericho':       ['kericho','kericho county'],
  'Kirinyaga':     ['kirinyaga','kerugoya','kirinyaga county'],
  'Kitui':         ['kitui','kitui county'],
  'Laikipia':      ['laikipia','nyahururu','laikipia county'],
  'Machakos':      ['machakos','machakos county'],
  'Makueni':       ['makueni','wote','makueni county'],
  'Murang\'a':     ["murang'a",'murangá','muranga','murang','kangema'],
  'Narok':         ['narok','narok county'],
  'Nandi':         ['nandi','kapsabet','nandi county'],
  'Nyandarua':     ['nyandarua','ol kalou','nyandarua county'],
  'Nyamira':       ['nyamira','nyamira county'],
  'Nyeri':         ['nyeri','nyeri county'],
  'Samburu':       ['samburu','maralal','samburu county'],
  'Siaya':         ['siaya','siaya county'],
  'Taita Taveta':  ['taita','taveta','taita taveta','wundanyi'],
  'Tharaka Nithi': ['tharaka','nithi','chuka','tharaka nithi'],
  'Trans Nzoia':   ['trans nzoia','kitale','trans nzoia county'],
  'Uasin Gishu':   ['uasin gishu','eldoret','eldoret county'],
  'Vihiga':        ['vihiga','vihiga county'],
  'West Pokot':    ['west pokot','kapenguria','west pokot county'],
  'National':      ['national','kenya','government of kenya','republic of kenya','ministry','state department'],
};

const SECTOR_KEYWORDS = {
  'Roads':       ['road','highway','bridge','bypass','tarmac','rehabilitation','pavement','street','drainage'],
  'Health':      ['hospital','clinic','dispensary','medical','health','nhif','kemsa','pharmacy','drug','equipment'],
  'Education':   ['school','college','university','tvet','classroom','laboratory','library','bursary','exam'],
  'Water':       ['water','sewerage','borehole','irrigation','dam','pipeline','sanitation','treatment'],
  'Agriculture': ['agriculture','farming','fertilizer','seed','livestock','irrigation','subsidy','grain'],
  'ICT':         ['ict','software','system','digital','computer','internet','network','platform','database'],
  'Security':    ['police','security','cctv','surveillance','defence','military'],
  'Infrastructure':['construction','building','market','hall','office','housing','infrastructure'],
  'Energy':      ['electricity','solar','power','energy','transformer','grid','ketraco','kplc'],
  'Transport':   ['transport','vehicle','bus','airport','railway','port','logistics'],
};

function inferCounty(text) {
  const t = (text || '').toLowerCase();
  for (const [county, keys] of Object.entries(COUNTY_KEYWORDS)) {
    if (keys.some(k => t.includes(k))) return county;
  }
  return 'National';
}

function inferSector(text) {
  const t = (text || '').toLowerCase();
  for (const [sector, keys] of Object.entries(SECTOR_KEYWORDS)) {
    if (keys.some(k => t.includes(k))) return sector;
  }
  return 'Infrastructure';
}

function scoreRisk({ value, bid_type, supplier, awarded_date, description }) {
  let score = 0;
  const flags = [];
  const bt = { single_source: 30, restricted: 15, emergency: 10, negotiated: 8, open: 0, direct: 25 };
  score += bt[bid_type] || 0;
  if (bid_type === 'single_source' || bid_type === 'direct') flags.push('Single-source/direct award — no competitive bidding');
  else if (bid_type === 'restricted') flags.push('Restricted bidding');

  if (value >= 5000000000) { score += 20; flags.push('Extremely high value contract — KES 5B+'); }
  else if (value >= 1000000000 && bid_type !== 'open') { score += 18; flags.push(`KES ${(value/1e9).toFixed(1)}B via non-open process`); }
  else if (value >= 500000000 && bid_type === 'single_source') { score += 22; flags.push(`KES ${(value/1e6).toFixed(0)}M single-source`); }

  const d = (description || '').toLowerCase();
  if (d.includes('ghost') || d.includes('cancelled') || d.includes('terminated')) { score += 15; flags.push('Contract associated with termination/cancellation'); }

  score = Math.min(Math.max(score, 0), 100);
  const risk_level = score >= 75 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  if (!flags.length) flags.push('No significant fraud indicators detected');
  return { score, risk_level, flags };
}

// ── Parse OCDS JSON line into our DB format ────────────────────────────────────
function parseOCDSRecord(record) {
  try {
    const ocid = record.ocid || '';
    const releases = record.releases || [record];

    let description = '', supplier = '', value = 0, bid_type = 'open';
    let awarded_date = null, procuring_entity = '';

    for (const r of releases) {
      if (r.tender) {
        description = description || r.tender.title || r.tender.description || '';
        const pm = (r.tender.procurementMethod || '').toLowerCase();
        if (pm.includes('single') || pm.includes('direct')) bid_type = 'single_source';
        else if (pm.includes('restricted')) bid_type = 'restricted';
        else if (pm.includes('emergency')) bid_type = 'emergency';
        else if (pm.includes('negotiated')) bid_type = 'negotiated';
        procuring_entity = procuring_entity || r.buyer?.name || r.tender?.procuringEntity?.name || '';
      }
      if (r.awards && r.awards.length > 0) {
        const award = r.awards[0];
        if (!supplier && award.suppliers && award.suppliers.length > 0) {
          supplier = award.suppliers[0].name || '';
        }
        if (!value && award.value && award.value.amount) {
          value = Math.round(parseFloat(award.value.amount) || 0);
          // Convert USD/EUR to KES if needed (approximate)
          const currency = (award.value.currency || 'KES').toUpperCase();
          if (currency === 'USD') value = Math.round(value * 130);
          else if (currency === 'EUR') value = Math.round(value * 140);
        }
        if (!awarded_date && award.date) awarded_date = award.date.split('T')[0];
      }
      if (r.contracts && r.contracts.length > 0) {
        const contract = r.contracts[0];
        if (!awarded_date && contract.dateSigned) awarded_date = contract.dateSigned.split('T')[0];
        if (!value && contract.value && contract.value.amount) {
          value = Math.round(parseFloat(contract.value.amount) || 0);
        }
      }
    }

    if (!description || description.length < 3) return null;

    const county = inferCounty((description + ' ' + procuring_entity).toLowerCase());
    const sector = inferSector(description.toLowerCase());
    const contract_id = 'OCDS-' + ocid.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
    const { score, risk_level, flags } = scoreRisk({ value, bid_type, supplier, awarded_date, description });

    return { contract_id, description: description.slice(0, 500), county, sector, value, supplier: (supplier || 'Unknown Supplier').slice(0, 200), bid_type, awarded_date, risk_score: score, risk_level, flags: JSON.stringify(flags), procuring_entity: (procuring_entity || '').slice(0, 200), ocds_ocid: ocid, source: 'ppip_ocds' };
  } catch {
    return null;
  }
}

// ── Fetch + ingest OCDS data ────────────────────────────────────────────────────
async function fetchAndIngestOCDS(year) {
  return new Promise((resolve, reject) => {
    const url = `https://data.open-contracting.org/en/publication/147/download?name=${year}.jsonl.gz`;
    console.log(`📥 Fetching OCDS data for year ${year} from OCP registry...`);

    const req = https.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        https.get(res.headers.location, { timeout: 120000 }, handleResponse).on('error', reject);
        return;
      }
      handleResponse(res);
    });

    function handleResponse(res) {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from OCDS source`));
        return;
      }

      const gunzip = zlib.createGunzip();
      let buffer = '';
      let inserted = 0, parsed = 0, errors = 0;
      const batchSize = 50;
      let batch = [];

      res.pipe(gunzip);
      gunzip.setEncoding('utf8');

      gunzip.on('data', async (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            const parsed_record = parseOCDSRecord(record);
            if (parsed_record) {
              batch.push(parsed_record);
              parsed++;
            }
          } catch { errors++; }

          if (batch.length >= batchSize) {
            const toInsert = batch.splice(0, batchSize);
            await insertBatch(toInsert).then(n => { inserted += n; }).catch(() => {});
          }
        }
      });

      gunzip.on('end', async () => {
        if (buffer.trim()) {
          try {
            const record = JSON.parse(buffer);
            const r = parseOCDSRecord(record);
            if (r) batch.push(r);
          } catch {}
        }
        if (batch.length > 0) {
          await insertBatch(batch).then(n => { inserted += n; }).catch(() => {});
        }
        console.log(`✅ OCDS ${year}: ${parsed} parsed, ${inserted} inserted, ${errors} parse errors`);
        resolve({ year, parsed, inserted, errors });
      });

      gunzip.on('error', reject);
    }

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

async function insertBatch(records) {
  if (!records.length) return 0;
  let count = 0;
  const client = await pool.connect();
  try {
    for (const r of records) {
      try {
        await client.query(
          `INSERT INTO contracts
            (contract_id,description,county,sector,value,supplier,bid_type,awarded_date,risk_score,risk_level,flags,procuring_entity,ocds_ocid,source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (contract_id) DO UPDATE SET
             description=EXCLUDED.description, risk_score=EXCLUDED.risk_score,
             risk_level=EXCLUDED.risk_level, flags=EXCLUDED.flags, updated_at=NOW()`,
          [r.contract_id, r.description, r.county, r.sector, r.value, r.supplier,
           r.bid_type, r.awarded_date, r.risk_score, r.risk_level, r.flags,
           r.procuring_entity, r.ocds_ocid, r.source]
        );
        count++;
      } catch {}
    }
  } finally { client.release(); }
  return count;
}

// ── Routes ──────────────────────────────────────────────────────────────────────

// GET /api/sync/status — check sync log
router.get('/status', async (req, res) => {
  try {
    const { rows: logs } = await pool.query('SELECT * FROM ocds_sync_log ORDER BY started_at DESC LIMIT 10');
    const { rows: counts } = await pool.query(`
      SELECT source, COUNT(*) as count FROM contracts GROUP BY source ORDER BY count DESC
    `);
    const { rows: total } = await pool.query('SELECT COUNT(*) as total FROM contracts');
    res.json({ success: true, data: { sync_logs: logs, by_source: counts, total_contracts: parseInt(total[0].total) } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/sync/ocds — trigger OCDS ingest for a given year
router.post('/ocds', async (req, res) => {
  const year = parseInt(req.body.year) || new Date().getFullYear();
  if (year < 2018 || year > new Date().getFullYear()) {
    return res.status(400).json({ success: false, error: `Year must be 2018–${new Date().getFullYear()}` });
  }

  // Log start
  const { rows: logRows } = await pool.query(
    'INSERT INTO ocds_sync_log (year, status) VALUES ($1,$2) RETURNING id',
    [year, 'running']
  );
  const logId = logRows[0].id;

  // Run async — don't block the response
  res.json({ success: true, message: `OCDS sync started for year ${year}. Check /api/sync/status for progress.`, log_id: logId });

  try {
    const result = await fetchAndIngestOCDS(year);
    await pool.query(
      'UPDATE ocds_sync_log SET status=$1, records=$2, finished_at=NOW() WHERE id=$3',
      ['complete', result.inserted, logId]
    );
  } catch (e) {
    console.error('OCDS sync error:', e.message);
    await pool.query(
      'UPDATE ocds_sync_log SET status=$1, finished_at=NOW() WHERE id=$2',
      ['failed', logId]
    );
  }
});

// GET /api/sync/counties — list all counties with contract counts
router.get('/counties', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT county, COUNT(*) as total,
        COUNT(*) FILTER (WHERE risk_level='HIGH') as high_risk,
        COUNT(*) FILTER (WHERE risk_level='MEDIUM') as medium_risk,
        AVG(risk_score)::INT as avg_score,
        COALESCE(SUM(value),0) as total_value
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
