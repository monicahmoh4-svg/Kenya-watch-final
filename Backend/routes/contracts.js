'use strict';
const router = require('express').Router();
const { pool } = require('../db');

function safeJSON(v) {
  try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); }
  catch { return []; }
}

function scoreContract({ value, supplier, supplier_reg_date, bid_type, awarded_date }) {
  let score = 0;
  const flags = [];
  const bt = { single_source: 30, restricted: 15, emergency: 10, negotiated: 8, open: 0, direct: 25 };
  score += bt[bid_type] || 0;
  if (bid_type === 'single_source' || bid_type === 'direct') flags.push('Single-source/direct award — no competitive bidding');
  else if (bid_type === 'restricted') flags.push('Restricted bidding — unusual for this value');

  if (supplier_reg_date && awarded_date) {
    const months = (new Date(awarded_date) - new Date(supplier_reg_date)) / (1000 * 60 * 60 * 24 * 30);
    if (months < 6)  { score += 28; flags.push(`Company only ${Math.floor(months)} months old at award`); }
    else if (months < 18) { score += 18; flags.push('Company less than 18 months old — limited track record'); }
    else if (months < 36) { score += 8;  flags.push('Company under 3 years old'); }
  }

  const intl = ['strabag','china road','sinohydro','mott macdonald','vitens','surbana','ibm','idemia','h young','raubex','china communications'];
  if (supplier && intl.some(i => supplier.toLowerCase().includes(i))) {
    score = Math.max(0, score - 15);
    flags.push('Positive: Established international contractor');
  }

  if (value >= 1000000000 && bid_type !== 'open') { score += 18; flags.push(`KES ${(value/1e9).toFixed(1)}B via non-open process`); }
  if (value >= 500000000 && bid_type === 'single_source') { score += 22; flags.push(`KES ${(value/1e6).toFixed(0)}M single-source`); }

  score = Math.min(Math.max(score, 0), 100);
  const risk_level = score >= 75 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  if (!flags.length) flags.push('No significant fraud indicators detected');
  return { score, risk_level, flags };
}

// ── GET / ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { county, sector, risk_level, search, source, page = 1, limit = 40 } = req.query;
    const conds = [], vals = [];
    let i = 1;
    if (county)     { conds.push(`county ILIKE $${i++}`);       vals.push(`%${county}%`); }
    if (sector)     { conds.push(`sector ILIKE $${i++}`);       vals.push(`%${sector}%`); }
    if (risk_level) { conds.push(`risk_level = $${i++}`);       vals.push(risk_level.toUpperCase()); }
    if (source)     { conds.push(`source = $${i++}`);           vals.push(source); }
    if (search)     { conds.push(`(description ILIKE $${i} OR supplier ILIKE $${i} OR contract_id ILIKE $${i} OR procuring_entity ILIKE $${i})`); vals.push(`%${search}%`); i++; }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const lim = Math.min(100, parseInt(limit) || 40);
    const off = (Math.max(1, parseInt(page) || 1) - 1) * lim;

    const [{ rows }, { rows: cnt }] = await Promise.all([
      pool.query(`SELECT * FROM contracts ${where} ORDER BY risk_score DESC, created_at DESC LIMIT $${i} OFFSET $${i+1}`, [...vals, lim, off]),
      pool.query(`SELECT COUNT(*) FROM contracts ${where}`, vals),
    ]);
    res.json({ success: true, data: rows.map(r => ({ ...r, flags: safeJSON(r.flags) })), total: parseInt(cnt[0].count) });
  } catch (e) { next(e); }
});

// ── GET /analytics ───────────────────────────────────────────────────────────
router.get('/analytics', async (req, res, next) => {
  try {
    const [risk, countyDB, sectorDB] = await Promise.all([
      pool.query(`SELECT risk_level, COUNT(*) AS count, COALESCE(SUM(value),0) AS total_value FROM contracts GROUP BY risk_level`),
      pool.query(`SELECT county, COUNT(*) AS count, AVG(risk_score)::INT AS avg_risk FROM contracts WHERE county IS NOT NULL GROUP BY county ORDER BY avg_risk DESC LIMIT 30`),
      pool.query(`SELECT sector, COUNT(*) AS count, AVG(risk_score)::INT AS avg_risk FROM contracts WHERE sector IS NOT NULL GROUP BY sector ORDER BY avg_risk DESC`),
    ]);

    // Embedded NECS 2023-24 county intelligence
    const countyIntelligence = [
      { county:'Kwale',          risk_score:96, bribery_likelihood:'Very High', necs_rank:1,  note:'Highest interaction rate >1.0 — NECS 2024' },
      { county:'Kilifi',         risk_score:94, bribery_likelihood:'Very High', necs_rank:2,  note:'Interaction rate >1.0' },
      { county:'Wajir',          risk_score:92, bribery_likelihood:'Very High', necs_rank:3,  note:'High interaction + top national share' },
      { county:'Mandera',        risk_score:88, bribery_likelihood:'Very High', necs_rank:4,  note:'Likelihood ≈1.0; weak local oversight' },
      { county:'Marsabit',       risk_score:87, bribery_likelihood:'Very High', necs_rank:5,  note:'Remote county — oversight gap' },
      { county:'Tharaka Nithi',  risk_score:85, bribery_likelihood:'High',      necs_rank:6,  note:'Likelihood ≈1.0' },
      { county:'Kitui',          risk_score:84, bribery_likelihood:'High',      necs_rank:7,  note:'High frequency + high bribe value' },
      { county:"Murang'a",       risk_score:83, bribery_likelihood:'High',      necs_rank:8,  note:'High bribe amount + high frequency' },
      { county:'Samburu',        risk_score:82, bribery_likelihood:'High',      necs_rank:9,  note:'Likelihood ≈1.0' },
      { county:'Elgeyo Marakwet',risk_score:81, bribery_likelihood:'High',      necs_rank:10, note:'Likelihood ≈1.0' },
      { county:'Vihiga',         risk_score:80, bribery_likelihood:'High',      necs_rank:11, note:'Likelihood ≈1.0' },
      { county:'Homa Bay',       risk_score:79, bribery_likelihood:'High',      necs_rank:12, note:'High frequency + national share' },
      { county:'West Pokot',     risk_score:77, bribery_likelihood:'High',      necs_rank:14, note:'Highest average bribe amount per incident' },
      { county:'Uasin Gishu',    risk_score:76, bribery_likelihood:'High',      necs_rank:15, note:'Top national share contributor' },
      { county:'Baringo',        risk_score:75, bribery_likelihood:'High',      necs_rank:16, note:'Top national share + earlier survey top' },
      { county:'Busia',          risk_score:74, bribery_likelihood:'High',      necs_rank:17, note:'Highest request probability — earlier survey' },
      { county:'Nairobi',        risk_score:73, bribery_likelihood:'High',      necs_rank:18, note:'Very high bribe value — police + procurement' },
      { county:'Embu',           risk_score:72, bribery_likelihood:'High',      necs_rank:19, note:'Top national share contributor' },
      { county:'Bomet',          risk_score:70, bribery_likelihood:'Medium',    necs_rank:20, note:'Top national share contributor' },
      { county:'Kakamega',       risk_score:69, bribery_likelihood:'Medium',    necs_rank:21, note:'Major national share; dense population' },
      { county:'Tana River',     risk_score:68, bribery_likelihood:'Medium',    necs_rank:22, note:'High national share; remote oversight gap' },
      { county:'Kiambu',         risk_score:67, bribery_likelihood:'Medium',    necs_rank:23, note:'Top national share; proximity to Nairobi' },
      { county:'Nakuru',         risk_score:65, bribery_likelihood:'Medium',    necs_rank:24, note:'Earlier survey: top bribe request probability' },
      { county:'Machakos',       risk_score:63, bribery_likelihood:'Medium',    necs_rank:25, note:'Earlier survey top' },
      { county:'Kisii',          risk_score:62, bribery_likelihood:'Medium',    necs_rank:26, note:'High bribe value per incident' },
      { county:'Mombasa',        risk_score:58, bribery_likelihood:'Medium',    necs_rank:27, note:'Port-related + police extortion' },
      { county:'Kisumu',         risk_score:55, bribery_likelihood:'Medium',    necs_rank:28, note:'County services corruption' },
      { county:'Turkana',        risk_score:54, bribery_likelihood:'Medium',    necs_rank:29, note:'Ghost projects; weak oversight' },
      { county:'Garissa',        risk_score:52, bribery_likelihood:'Medium',    necs_rank:30, note:'Remote; infrastructure fraud risk' },
    ];

    const dbCountyMap = {};
    countyDB.rows.forEach(r => { dbCountyMap[r.county] = r; });
    const mergedCounties = countyIntelligence.map(c => {
      const db = dbCountyMap[c.county] || {};
      const combined = Math.round((c.risk_score * 0.7) + ((parseInt(db.avg_risk) || 0) * 0.3));
      return { county: c.county, avg_risk: combined || c.risk_score, necs_risk_score: c.risk_score, bribery_likelihood: c.bribery_likelihood, necs_rank: c.necs_rank, note: c.note, contract_count: parseInt(db.count) || 0 };
    }).sort((a, b) => b.avg_risk - a.avg_risk);

    // Embedded EACC sector intelligence
    const sectorIntelligence = [
      { sector:'Police / Law Enforcement', risk_score:95, frequency:'Very High', value_per_case:'Low–Med',   description:'Highest bribe demand frequency. Traffic offenses, avoiding fines and arrest.' },
      { sector:'Public Procurement',       risk_score:92, frequency:'Low',       value_per_case:'Extreme',   description:'Over 70% of corruption losses. Inflated contracts, kickbacks, ghost projects.' },
      { sector:'Land & Property',          risk_score:90, frequency:'Medium',    value_per_case:'Very High', description:'Title deeds, transfers, zoning. Fast-tracking and illegal land allocation.' },
      { sector:'County Government',        risk_score:85, frequency:'High',      value_per_case:'Medium',    description:'Licensing, permits, inspections. Construction permits and market licenses.' },
      { sector:'Health',                   risk_score:78, frequency:'High',      value_per_case:'Low–Med',   description:'Paying for free services, queue jumping, access to drugs at public facilities.' },
      { sector:'Judiciary',                risk_score:75, frequency:'Low',       value_per_case:'High',      description:'Influencing case outcomes. Delaying or expediting court hearings.' },
      { sector:'Transport / NTSA',         risk_score:72, frequency:'High',      value_per_case:'Low–Med',   description:'Driving licenses, vehicle inspections. Systemic bribery in licensing.' },
      { sector:'Tax & Revenue (KRA)',       risk_score:68, frequency:'Medium',   value_per_case:'High',      description:'Bribes to reduce tax liabilities and facilitate evasion.' },
      { sector:'Education',                risk_score:65, frequency:'Medium',    value_per_case:'Variable',  description:'Admission bribery, exam facilitation, misuse of school funds.' },
      { sector:'Immigration',              risk_score:62, frequency:'Medium',    value_per_case:'Med–High',  description:'Fast-tracking passports, visas, work permits. Illegal document issuance.' },
    ];
    const dbSectorMap = {};
    sectorDB.rows.forEach(r => { dbSectorMap[r.sector] = r; });
    const mergedSectors = sectorIntelligence.map(s => {
      const db = dbSectorMap[s.sector] || {};
      const combined = Math.round((s.risk_score * 0.75) + ((parseInt(db.avg_risk) || 0) * 0.25));
      return { ...s, avg_risk: combined || s.risk_score, contract_count: parseInt(db.count) || 0 };
    }).sort((a, b) => b.avg_risk - a.avg_risk);

    // EACC procurement risk distribution
    const procurementRisk = [
      { category:'Infrastructure & Public Works', pct:35, risk:'HIGH',   desc:'Roads, dams, buildings. Ghost projects, inflated pricing, contractor collusion.' },
      { category:'Energy & Utilities',            pct:18, risk:'HIGH',   desc:'Electricity and water projects. Overpriced equipment, kickbacks.' },
      { category:'Health Sector',                 pct:13, risk:'HIGH',   desc:'Medical equipment and drugs. PPE scandals, expired supplies.' },
      { category:'Education Sector',              pct:10, risk:'MEDIUM', desc:'School construction, textbooks. Ghost schools and overpriced materials.' },
      { category:'ICT & Digital Systems',         pct:9,  risk:'MEDIUM', desc:'Government software. Overpriced, non-functional systems.' },
      { category:'County Local Contracts',        pct:8,  risk:'MEDIUM', desc:'Local roads, markets. Political patronage and unqualified firms.' },
      { category:'Security Procurement',          pct:6,  risk:'HIGH',   desc:'Police and military equipment. Classified, low transparency.' },
      { category:'Agriculture & Subsidies',       pct:6,  risk:'MEDIUM', desc:'Fertilizer, subsidies. Diversion of goods and fake beneficiaries.' },
    ];

    res.json({
      success: true,
      data: {
        risk_distribution: risk.rows,
        county_breakdown: mergedCounties,
        sector_breakdown: mergedSectors,
        procurement_risk_distribution: procurementRisk,
        data_sources: ['NECS 2023-24 (EACC/KNBS)', 'EACC Annual Reports', 'PPRA/PPIP OCDS', 'KenyaWatch AI Database'],
      }
    });
  } catch (e) { next(e); }
});

// ── GET /meta/stats ──────────────────────────────────────────────────────────
router.get('/meta/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE risk_level='HIGH')   AS high_risk,
        COUNT(*) FILTER (WHERE risk_level='MEDIUM') AS medium_risk,
        COUNT(*) FILTER (WHERE risk_level='LOW')    AS low_risk,
        COUNT(*)                                    AS total,
        COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'), 0) AS high_risk_value
      FROM contracts
    `);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contracts WHERE id=$1 OR contract_id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Contract not found' });
    const c = { ...rows[0], flags: safeJSON(rows[0].flags) };
    const { rows: hist } = await pool.query(
      `SELECT contract_id,description,value,risk_score,risk_level FROM contracts WHERE supplier ILIKE $1 AND id!=$2 LIMIT 5`,
      [`%${c.supplier}%`, c.id]
    );
    res.json({ success: true, data: c, supplier_history: hist });
  } catch (e) { next(e); }
});

// ── POST /scan ───────────────────────────────────────────────────────────────
router.post('/scan', async (req, res, next) => {
  try {
    const { contract_id, description, county, sector, value, supplier, supplier_reg_date, bid_type, awarded_date, procuring_entity } = req.body;
    if (!contract_id || !supplier || !value) return res.status(400).json({ success: false, error: 'contract_id, supplier and value are required' });
    const { score, risk_level, flags } = scoreContract({ value: parseInt(value), supplier, supplier_reg_date, bid_type, awarded_date });
    const { rows } = await pool.query(
      `INSERT INTO contracts (contract_id,description,county,sector,value,supplier,supplier_reg_date,bid_type,awarded_date,risk_score,risk_level,flags,procuring_entity,source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual')
       ON CONFLICT (contract_id) DO UPDATE SET risk_score=$10,risk_level=$11,flags=$12,updated_at=NOW() RETURNING *`,
      [contract_id, description || 'N/A', county || null, sector || null, parseInt(value), supplier, supplier_reg_date || null, bid_type || 'open', awarded_date || null, score, risk_level, JSON.stringify(flags), procuring_entity || null]
    );
    res.status(201).json({ success: true, data: { ...rows[0], flags } });
  } catch (e) { next(e); }
});

router.post('/', (req, res, next) => { req.url = '/scan'; router.handle(req, res, next); });

// ── PUT /:id ─────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const { rows: ex } = await pool.query('SELECT * FROM contracts WHERE id=$1 OR contract_id=$1', [req.params.id]);
    if (!ex.length) return res.status(404).json({ success: false, error: 'Not found' });
    const c = ex[0], b = req.body;
    const merged = { value: b.value ? parseInt(b.value) : c.value, supplier: b.supplier || c.supplier, supplier_reg_date: b.supplier_reg_date || c.supplier_reg_date, bid_type: b.bid_type || c.bid_type, awarded_date: b.awarded_date || c.awarded_date };
    const { score, risk_level, flags } = scoreContract(merged);
    const { rows } = await pool.query(
      `UPDATE contracts SET description=COALESCE($1,description),county=COALESCE($2,county),sector=COALESCE($3,sector),value=COALESCE($4,value),supplier=COALESCE($5,supplier),risk_score=$6,risk_level=$7,flags=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [b.description || null, b.county || null, b.sector || null, b.value ? parseInt(b.value) : null, b.supplier || null, score, risk_level, JSON.stringify(flags), c.id]
    );
    res.json({ success: true, data: { ...rows[0], flags } });
  } catch (e) { next(e); }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM contracts WHERE id=$1 OR contract_id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { next(e); }
});

module.exports = router;
