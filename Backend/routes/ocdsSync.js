'use strict';
/**
 * OCDS Sync Route — Real Kenya government contracts from PPIP
 * Source: https://data.open-contracting.org/en/publication/147
 * Coverage: 105,738+ contracts, Jul 2018–present, all 47 counties
 * Auto-syncs every 6 hours via server.js scheduler
 */

const router = require('express').Router();
const https  = require('https');
const http   = require('http');
const zlib   = require('zlib');
const { pool } = require('../db');

// ── County keyword map — all 47 counties ─────────────────────────────────────
const COUNTY_MAP = {
  'Nairobi':          ['nairobi','city county','upper hill','westlands','kibera','langata','kasarani','embakasi','ncc'],
  'Mombasa':          ['mombasa','kilindini','mvita','likoni','changamwe'],
  'Kisumu':           ['kisumu','nyanza','winam'],
  'Nakuru':           ['nakuru','naivasha','gilgil'],
  'Kiambu':           ['kiambu','thika','ruiru','gatundu','limuru'],
  'Kisii':            ['kisii','gusii'],
  'Kakamega':         ['kakamega','mumias'],
  'Meru':             ['meru county','meru '],
  'Kilifi':           ['kilifi','malindi','kaloleni'],
  'Kwale':            ['kwale','msambweni','kinango'],
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
  'Roads':         ['road','highway','bridge','bypass','tarmac','rehabilitation','pavement','culvert','drainage'],
  'Health':        ['hospital','clinic','dispensary','medical','health','nhif','kemsa','pharmacy','drug'],
  'Education':     ['school','college','university','tvet','classroom','laboratory','library','bursary','exam'],
  'Water':         ['water','sewerage','borehole','irrigation','dam','pipeline','sanitation','treatment'],
  'Agriculture':   ['agriculture','farming','fertilizer','seed','livestock','subsidy','grain','maize','crop'],
  'ICT':           ['ict','software','system','digital','computer','network','platform','database','application'],
  'Security':      ['police','security','cctv','surveillance','defence','military'],
  'Infrastructure':['construction','building','market','hall','office','housing','warehouse','stadium'],
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
  const methods = { single_source:30, direct:28, restricted:15, emergency:10, negotiated:8, open:0 };
  score += methods[bid_type] || 0;
  if (bid_type === 'single_source' || bid_type === 'direct') flags.push('Single-source/direct award — no competitive bidding');
  else if (bid_type === 'restricted') flags.push('Restricted bidding process');
  const v = parseInt(value) || 0;
  if (v >= 5000000000) { score += 20; flags.push('Extremely high value — KES '+(v/1e9).toFixed(1)+'B'); }
  else if (v >= 1000000000 && bid_type !== 'open') { score += 18; flags.push('KES '+(v/1e9).toFixed(1)+'B via non-open process'); }
  else if (v >= 500000000 && (bid_type==='single_source'||bid_type==='direct')) { score += 22; flags.push('KES '+(v/1e6).toFixed(0)+'M single-source'); }
  score = Math.min(Math.max(score,0),100);
  const risk_level = score>=75?'HIGH':score>=40?'MEDIUM':'LOW';
  if (!flags.length) flags.push('No significant fraud indicators detected');
  return { score, risk_level, flags };
}

function parseOCDSRecord(record) {
  try {
    const ocid = (record.ocid||'').trim();
    if (!ocid) return null;
    const releases = Array.isArray(record.releases)?record.releases:[record];
    let description='', supplier='', value=0, bid_type='open', awarded_date=null, procuring_entity='';

    for (const r of releases) {
      if (r.tender && !description) {
        description = (r.tender.title||r.tender.description||'').trim();
        if (!procuring_entity) procuring_entity = ((r.buyer&&r.buyer.name)||(r.tender.procuringEntity&&r.tender.procuringEntity.name)||'').trim();
        const pm = (r.tender.procurementMethod||r.tender.procurementMethodDetails||'').toLowerCase();
        if      (pm.includes('single')||pm.includes('direct')) bid_type='single_source';
        else if (pm.includes('restrict'))                      bid_type='restricted';
        else if (pm.includes('emergency'))                     bid_type='emergency';
        else if (pm.includes('negotiat'))                      bid_type='negotiated';
      }
      if (!supplier && r.awards && r.awards.length>0) {
        const aw = r.awards[0];
        if (aw.suppliers&&aw.suppliers.length>0) supplier=(aw.suppliers[0].name||'').trim();
        if (!value && aw.value&&aw.value.amount) {
          value = Math.round(parseFloat(aw.value.amount)||0);
          const cur = (aw.value.currency||'KES').toUpperCase();
          if (cur==='USD') value=Math.round(value*130);
          else if (cur==='EUR') value=Math.round(value*140);
          else if (cur==='GBP') value=Math.round(value*165);
        }
        if (!awarded_date && aw.date) awarded_date=aw.date.slice(0,10);
      }
      if (r.contracts&&r.contracts.length>0) {
        const co=r.contracts[0];
        if (!awarded_date&&co.dateSigned) awarded_date=co.dateSigned.slice(0,10);
        if (!value&&co.value&&co.value.amount) value=Math.round(parseFloat(co.value.amount)||0);
      }
      if (!procuring_entity&&r.buyer&&r.buyer.name) procuring_entity=r.buyer.name.trim();
    }

    if (!description||description.length<4) return null;
    const contract_id = ('OCDS-'+ocid.replace(/[^a-zA-Z0-9-]/g,'-')).slice(0,100);
    const { score, risk_level, flags } = scoreRisk(value, bid_type);

    return {
      contract_id,
      description:      description.slice(0,500),
      county:           inferCounty(description+' '+procuring_entity),
      sector:           inferSector(description),
      value,
      supplier:         (supplier||'Unknown Supplier').slice(0,200),
      bid_type,
      awarded_date:     awarded_date||null,
      risk_score:       score,
      risk_level,
      flags:            JSON.stringify(flags),
      procuring_entity: procuring_entity.slice(0,200),
      ocds_ocid:        ocid.slice(0,100),
    };
  } catch (_) { return null; }
}

async function insertBatch(records) {
  if (!records.length) return 0;
  let count=0, client;
  try {
    client = await pool.connect();
    for (const r of records) {
      try {
        const result = await client.query(
          `INSERT INTO contracts
             (contract_id,description,county,sector,value,supplier,bid_type,
              awarded_date,risk_score,risk_level,flags,procuring_entity,ocds_ocid,source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ppip_ocds')
           ON CONFLICT (contract_id) DO UPDATE SET
             description=EXCLUDED.description,
             risk_score=EXCLUDED.risk_score,
             risk_level=EXCLUDED.risk_level,
             flags=EXCLUDED.flags,
             updated_at=NOW()
           RETURNING (xmax=0) AS is_new`,
          [r.contract_id,r.description,r.county,r.sector,r.value,
           r.supplier,r.bid_type,r.awarded_date,r.risk_score,
           r.risk_level,r.flags,r.procuring_entity,r.ocds_ocid]
        );
        // Track new (not updated) insertions
        if (result.rows[0]&&result.rows[0].is_new) count++;
      } catch (_) {}
    }
  } finally { if (client) client.release(); }
  return count;
}

// ── Exported so server.js auto-scheduler can call it ─────────────────────────
async function fetchAndIngest(year, logId) {
  const url = 'https://data.open-contracting.org/en/publication/147/download?name='+year+'.jsonl.gz';
  console.log('📥 OCDS '+year+': downloading from OCP registry...');

  return new Promise((resolve, reject) => {
    function doGet(targetUrl, hops) {
      if (hops>5) return reject(new Error('Too many redirects'));
      const mod = targetUrl.startsWith('https')?https:http;
      const req = mod.get(targetUrl, { timeout:180000 }, (res) => {
        if (res.statusCode===301||res.statusCode===302) { res.resume(); return doGet(res.headers.location, hops+1); }
        if (res.statusCode!==200) { res.resume(); return reject(new Error('HTTP '+res.statusCode)); }

        const gunzip = zlib.createGunzip();
        res.pipe(gunzip);
        gunzip.setEncoding('utf8');

        let buffer='', inserted=0, parsed=0, errors=0, batch=[], flushing=false;
        const BATCH=50;

        async function flush() {
          if (flushing||!batch.length) return;
          flushing=true;
          const rows=batch.splice(0);
          try {
            const n=await insertBatch(rows);
            inserted+=n;
            pool.query('UPDATE ocds_sync_log SET records=$1 WHERE id=$2',[inserted,logId]).catch(()=>{});
          } catch(_){}
          flushing=false;
        }

        gunzip.on('data',(chunk)=>{
          buffer+=chunk;
          const lines=buffer.split('\n');
          buffer=lines.pop();
          for (const line of lines) {
            const l=line.trim(); if(!l) continue;
            try { const rec=parseOCDSRecord(JSON.parse(l)); if(rec){batch.push(rec);parsed++;} } catch(_){errors++;}
            if (batch.length>=BATCH) { gunzip.pause(); flush().then(()=>gunzip.resume()).catch(()=>gunzip.resume()); }
          }
        });

        gunzip.on('end', async()=>{
          if (buffer.trim()) { try{const rec=parseOCDSRecord(JSON.parse(buffer.trim()));if(rec)batch.push(rec);}catch(_){} }
          await flush();
          console.log('✅ OCDS '+year+': '+parsed+' parsed, '+inserted+' new, '+errors+' errors');
          resolve({ year, parsed, inserted, errors });
        });

        gunzip.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout',()=>{ req.destroy(); reject(new Error('Download timeout')); });
    }
    doGet(url, 0);
  });
}

// ── Ensure log table ──────────────────────────────────────────────────────────
const ENSURE_LOG = `CREATE TABLE IF NOT EXISTS ocds_sync_log (
  id SERIAL PRIMARY KEY, year INTEGER, status VARCHAR(20) DEFAULT 'pending',
  records INTEGER DEFAULT 0, error_msg TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(), finished_at TIMESTAMPTZ)`;

// ── POST /api/sync/ocds ───────────────────────────────────────────────────────
router.post('/ocds', async (req, res) => {
  const year = parseInt((req.body&&req.body.year)||new Date().getFullYear());
  if (!year||year<2018||year>new Date().getFullYear()) {
    return res.status(400).json({ success:false, error:'Year must be 2018–'+new Date().getFullYear() });
  }
  try { await pool.query(ENSURE_LOG); } catch(_){}

  let logId;
  try {
    const {rows} = await pool.query("INSERT INTO ocds_sync_log(year,status) VALUES($1,'running') RETURNING id",[year]);
    logId = rows[0].id;
  } catch(e) { return res.status(500).json({ success:false, error:'Log error: '+e.message }); }

  res.json({ success:true, message:'OCDS sync started for year '+year+'. Check Refresh Status in 3–5 minutes.', log_id:logId, year });

  setImmediate(()=>{
    fetchAndIngest(year, logId)
      .then(result=>{
        pool.query("UPDATE ocds_sync_log SET status='complete',records=$1,finished_at=NOW() WHERE id=$2",[result.inserted,logId]).catch(()=>{});
        // Broadcast notification to all connected SSE clients
        if (result.inserted>0 && req.app.locals.broadcast) {
          req.app.locals.broadcast('new_contracts', {
            message: result.inserted+' new contracts imported from PPIP OCDS ('+year+')',
            count: result.inserted,
            year,
            timestamp: new Date().toISOString(),
          });
        }
      })
      .catch(err=>{
        pool.query("UPDATE ocds_sync_log SET status='failed',error_msg=$1,finished_at=NOW() WHERE id=$2",[err.message,logId]).catch(()=>{});
      });
  });
});

// ── GET /api/sync/status ──────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try { await pool.query(ENSURE_LOG); } catch(_){}
  try {
    const [logs, counts, total, recent] = await Promise.all([
      pool.query('SELECT * FROM ocds_sync_log ORDER BY started_at DESC LIMIT 10'),
      pool.query('SELECT source, COUNT(*) AS count FROM contracts GROUP BY source ORDER BY count DESC'),
      pool.query('SELECT COUNT(*) AS total FROM contracts'),
      pool.query(`SELECT contract_id,description,county,sector,value,risk_level,risk_score,created_at
                  FROM contracts WHERE source='ppip_ocds' ORDER BY created_at DESC LIMIT 5`),
    ]);
    return res.json({ success:true, data:{
      sync_logs:       logs.rows,
      by_source:       counts.rows,
      total_contracts: parseInt(total.rows[0].total)||0,
      recent_imports:  recent.rows,
    }});
  } catch(e) { return res.status(500).json({ success:false, error:e.message }); }
});

// ── GET /api/sync/counties ────────────────────────────────────────────────────
router.get('/counties', async (req, res) => {
  try {
    const {rows} = await pool.query(`
      SELECT county, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE risk_level='HIGH')   AS high_risk,
        COUNT(*) FILTER (WHERE risk_level='MEDIUM') AS medium_risk,
        AVG(risk_score)::INT AS avg_score,
        COALESCE(SUM(value),0) AS total_value
      FROM contracts WHERE county IS NOT NULL GROUP BY county ORDER BY total DESC
    `);
    return res.json({ success:true, data:rows, total:rows.length });
  } catch(e) { return res.status(500).json({ success:false, error:e.message }); }
});

module.exports = router;
module.exports.fetchAndIngest = fetchAndIngest;
