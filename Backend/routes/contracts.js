'use strict';
const router = require('express').Router();
const { pool } = require('../db');

function safeJSON(v) { try { return Array.isArray(v) ? v : JSON.parse(v||'[]'); } catch { return []; } }
function scoreContract({value,supplier,supplier_reg_date,bid_type,awarded_date,sector}) {
  let score=0; const flags=[];
  const bt={single_source:30,restricted:15,emergency:10,negotiated:8,open:0};
  score+=bt[bid_type]||0;
  if(bid_type==='single_source') flags.push('Single-source award — no competitive bidding');
  else if(bid_type==='restricted') flags.push('Restricted bidding — unusual for this value');
  if(supplier_reg_date&&awarded_date){
    const months=(new Date(awarded_date)-new Date(supplier_reg_date))/(1000*60*60*24*30);
    if(months<6){score+=28;flags.push(`Company only ${Math.floor(months)} months old at award`);}
    else if(months<18){score+=18;flags.push('Company less than 18 months old — limited track record');}
    else if(months<36){score+=8;flags.push('Company under 3 years old');}
  }
  const intl=['strabag','china road','sinohydro','mott macdonald','vitens','surbana','ibm','idemia','h young'];
  if(supplier&&intl.some(i=>supplier.toLowerCase().includes(i))){score=Math.max(0,score-15);flags.push('Positive: Established international contractor');}
  const donor=['world bank','afdb','eu funded','kfw','adb','usaid'];
  if(flags.some(f=>donor.some(d=>f.toLowerCase().includes(d)))){score=Math.max(0,score-12);}
  if(value>=1000000000&&bid_type!=='open'){score+=18;flags.push(`KES ${(value/1e9).toFixed(1)}B via non-open process`);}
  if(value>=500000000&&bid_type==='single_source'){score+=22;flags.push(`KES ${(value/1e6).toFixed(0)}M single-source`);}
  score=Math.min(Math.max(score,0),100);
  const risk_level=score>=75?'HIGH':score>=40?'MEDIUM':'LOW';
  if(!flags.length)flags.push('No significant fraud indicators detected');
  return {score,risk_level,flags};
}

router.get('/', async (req,res,next) => {
  try {
    const {county,sector,risk_level,search,page=1,limit=20} = req.query;
    const conds=[]; const vals=[]; let i=1;
    if(county){conds.push(`county ILIKE $${i++}`);vals.push(`%${county}%`);}
    if(sector){conds.push(`sector ILIKE $${i++}`);vals.push(`%${sector}%`);}
    if(risk_level){conds.push(`risk_level=$${i++}`);vals.push(risk_level.toUpperCase());}
    if(search){conds.push(`(description ILIKE $${i} OR supplier ILIKE $${i} OR contract_id ILIKE $${i})`);vals.push(`%${search}%`);i++;}
    const where=conds.length?'WHERE '+conds.join(' AND '):'';
    const lim=Math.min(100,parseInt(limit)||20);
    const off=(Math.max(1,parseInt(page)||1)-1)*lim;
    const [{rows},{rows:cnt}] = await Promise.all([
      pool.query(`SELECT * FROM contracts ${where} ORDER BY risk_score DESC LIMIT $${i} OFFSET $${i+1}`,[...vals,lim,off]),
      pool.query(`SELECT COUNT(*) FROM contracts ${where}`,vals)
    ]);
    res.json({success:true,data:rows.map(r=>({...r,flags:safeJSON(r.flags)})),total:parseInt(cnt[0].count)});
  } catch(e){next(e);}
});

router.get('/analytics', async (req,res,next) => {
  try {
    const [risk,county,sector] = await Promise.all([
      pool.query(`SELECT risk_level,COUNT(*) AS count,COALESCE(SUM(value),0) AS total_value FROM contracts GROUP BY risk_level`),
      pool.query(`SELECT county,COUNT(*) AS count,AVG(risk_score)::INT AS avg_risk FROM contracts GROUP BY county ORDER BY avg_risk DESC LIMIT 15`),
      pool.query(`SELECT sector,COUNT(*) AS count,AVG(risk_score)::INT AS avg_risk FROM contracts GROUP BY sector ORDER BY avg_risk DESC`),
    ]);
    res.json({success:true,data:{risk_distribution:risk.rows,county_breakdown:county.rows,sector_breakdown:sector.rows}});
  } catch(e){next(e);}
});

router.get('/meta/stats', async (req,res,next) => {
  try {
    const {rows} = await pool.query(`SELECT COUNT(*) FILTER (WHERE risk_level='HIGH') AS high_risk,COUNT(*) FILTER (WHERE risk_level='MEDIUM') AS medium_risk,COUNT(*) FILTER (WHERE risk_level='LOW') AS low_risk,COUNT(*) AS total,COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS high_risk_value FROM contracts`);
    res.json({success:true,data:rows[0]});
  } catch(e){next(e);}
});

router.get('/:id', async (req,res,next) => {
  try {
    const {rows} = await pool.query('SELECT * FROM contracts WHERE id=$1 OR contract_id=$1',[req.params.id]);
    if(!rows.length) return res.status(404).json({success:false,error:'Not found'});
    const c={...rows[0],flags:safeJSON(rows[0].flags)};
    const {rows:hist} = await pool.query(`SELECT contract_id,description,value,risk_score,risk_level FROM contracts WHERE supplier ILIKE $1 AND id!=$2 LIMIT 5`,[`%${c.supplier}%`,c.id]);
    res.json({success:true,data:c,supplier_history:hist});
  } catch(e){next(e);}
});

router.post('/scan', async (req,res,next) => {
  try {
    const {contract_id,description,county,sector,value,supplier,supplier_reg_date,bid_type,awarded_date,procuring_entity} = req.body;
    if(!contract_id||!supplier||!value) return res.status(400).json({success:false,error:'contract_id, supplier and value required'});
    const {score,risk_level,flags} = scoreContract({value:parseInt(value),supplier,supplier_reg_date,bid_type,awarded_date,sector});
    const {rows} = await pool.query(
      `INSERT INTO contracts (contract_id,description,county,sector,value,supplier,supplier_reg_date,bid_type,awarded_date,risk_score,risk_level,flags,procuring_entity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (contract_id) DO UPDATE SET risk_score=$10,risk_level=$11,flags=$12,updated_at=NOW() RETURNING *`,
      [contract_id,description||'N/A',county||null,sector||null,parseInt(value),supplier,supplier_reg_date||null,bid_type||'open',awarded_date||null,score,risk_level,JSON.stringify(flags),procuring_entity||null]
    );
    res.status(201).json({success:true,data:{...rows[0],flags}});
  } catch(e){next(e);}
});

router.post('/', async (req,res,next) => { req.url='/scan'; router.handle(req,res,next); });

router.put('/:id', async (req,res,next) => {
  try {
    const {rows:ex} = await pool.query('SELECT * FROM contracts WHERE id=$1 OR contract_id=$1',[req.params.id]);
    if(!ex.length) return res.status(404).json({success:false,error:'Not found'});
    const c=ex[0]; const b=req.body;
    const merged={value:b.value?parseInt(b.value):c.value,supplier:b.supplier||c.supplier,supplier_reg_date:b.supplier_reg_date||c.supplier_reg_date,bid_type:b.bid_type||c.bid_type,awarded_date:b.awarded_date||c.awarded_date,sector:b.sector||c.sector};
    const {score,risk_level,flags} = scoreContract(merged);
    const {rows} = await pool.query(
      `UPDATE contracts SET description=COALESCE($1,description),county=COALESCE($2,county),sector=COALESCE($3,sector),value=COALESCE($4,value),supplier=COALESCE($5,supplier),risk_score=$6,risk_level=$7,flags=$8,status=COALESCE($9,status),updated_at=NOW() WHERE id=$10 RETURNING *`,
      [b.description||null,b.county||null,b.sector||null,b.value?parseInt(b.value):null,b.supplier||null,score,risk_level,JSON.stringify(flags),b.status||null,c.id]
    );
    res.json({success:true,data:{...rows[0],flags}});
  } catch(e){next(e);}
});

router.delete('/:id', async (req,res,next) => {
  try {
    const {rowCount} = await pool.query('DELETE FROM contracts WHERE id=$1 OR contract_id=$1',[req.params.id]);
    if(!rowCount) return res.status(404).json({success:false,error:'Not found'});
    res.json({success:true,message:'Deleted'});
  } catch(e){next(e);}
});

module.exports = router;
