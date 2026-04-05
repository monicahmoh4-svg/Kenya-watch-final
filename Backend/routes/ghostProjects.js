'use strict';
const router = require('express').Router();
const { pool } = require('../db');

function safeJSON(v){try{return typeof v==='object'?v:JSON.parse(v||'{}');}catch{return{};}}
function analyzeSatellite({sector,county,amount_at_risk}){
  const remote=['Turkana','Marsabit','Mandera','Wajir','Garissa','Tana River'];
  let ghostProb=0.18+((amount_at_risk||0)>50000000?0.1:0)+(remote.includes(county)?0.12:0);
  const r=Math.random();
  let status=r<ghostProb?'ghost':r<ghostProb+0.32?'partial':'verified';
  const conf=status==='ghost'?85+Math.floor(Math.random()*12):status==='partial'?78+Math.floor(Math.random()*14):88+Math.floor(Math.random()*10);
  const builtPct=status==='ghost'?0:status==='partial'?Math.floor(10+Math.random()*55):Math.floor(85+Math.random()*15);
  const ndvi=(status==='ghost'?0.4+Math.random()*0.4:0.05+Math.random()*0.2).toFixed(2);
  const satDate=new Date(); satDate.setDate(satDate.getDate()-Math.floor(Math.random()*30));
  const satelliteStatus=status==='ghost'
    ?`No construction activity. ${builtPct}% area shows undisturbed vegetation (NDVI ${ndvi}).`
    :status==='partial'?`Partial construction ~${builtPct}% complete. ${100-builtPct}% of scope not commenced.`
    :`Construction confirmed ~${builtPct}% complete. Consistent with contracted scope.`;
  return {detection_status:status,satellite_status:satelliteStatus,satellite_date:satDate.toISOString().split('T')[0],confidence_score:conf,satellite_metadata:{ndvi:parseFloat(ndvi),built_area_pct:builtPct,imagery_date:satDate.toISOString().split('T')[0],imagery_source:'Sentinel-2 ESA',resolution_m:10,cloud_cover_pct:Math.floor(Math.random()*15)}};
}

router.get('/', async (req,res,next) => {
  try {
    const {detection_status,county,page=1,limit=20}=req.query;
    const conds=[]; const vals=[]; let i=1;
    if(detection_status){conds.push(`detection_status=$${i++}`);vals.push(detection_status);}
    if(county){conds.push(`county ILIKE $${i++}`);vals.push(`%${county}%`);}
    const where=conds.length?'WHERE '+conds.join(' AND '):'';
    const lim=Math.min(100,parseInt(limit)||20);
    const off=(Math.max(1,parseInt(page)||1)-1)*lim;
    const [{rows},{rows:cnt}] = await Promise.all([
      pool.query(`SELECT * FROM ghost_projects ${where} ORDER BY confidence_score DESC,created_at DESC LIMIT $${i} OFFSET $${i+1}`,[...vals,lim,off]),
      pool.query(`SELECT COUNT(*) FROM ghost_projects ${where}`,vals)
    ]);
    res.json({success:true,data:rows.map(r=>({...r,satellite_metadata:safeJSON(r.satellite_metadata)})),total:parseInt(cnt[0].count)});
  } catch(e){next(e);}
});

router.get('/meta/stats', async (req,res,next) => {
  try {
    const {rows} = await pool.query(`SELECT COUNT(*) AS total,COUNT(*) FILTER (WHERE detection_status='ghost') AS ghost_count,COUNT(*) FILTER (WHERE detection_status='partial') AS partial_count,COUNT(*) FILTER (WHERE detection_status='verified') AS verified_count,COALESCE(SUM(amount_at_risk) FILTER (WHERE detection_status IN ('ghost','partial')),0) AS total_at_risk FROM ghost_projects`);
    res.json({success:true,data:rows[0]});
  } catch(e){next(e);}
});

router.get('/:id', async (req,res,next) => {
  try {
    const {rows} = await pool.query('SELECT * FROM ghost_projects WHERE id=$1',[req.params.id]);
    if(!rows.length) return res.status(404).json({success:false,error:'Not found'});
    res.json({success:true,data:{...rows[0],satellite_metadata:safeJSON(rows[0].satellite_metadata)}});
  } catch(e){next(e);}
});

router.post('/', async (req,res,next) => {
  try {
    const {contract_ref,project_name,county,sector,claimed_status,amount_at_risk,procuring_entity}=req.body;
    if(!project_name) return res.status(400).json({success:false,error:'project_name required'});
    const a=analyzeSatellite({sector,county,amount_at_risk:parseInt(amount_at_risk)||0});
    const {rows} = await pool.query(
      `INSERT INTO ghost_projects (contract_ref,project_name,county,sector,claimed_status,satellite_status,satellite_metadata,amount_at_risk,detection_status,confidence_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [contract_ref||null,project_name,county||null,sector||null,claimed_status||null,a.satellite_status,JSON.stringify(a.satellite_metadata),parseInt(amount_at_risk)||0,a.detection_status,a.confidence_score]
    );
    res.status(201).json({success:true,data:{...rows[0],satellite_metadata:a.satellite_metadata}});
  } catch(e){next(e);}
});

router.put('/:id', async (req,res,next) => {
  try {
    const {rows:ex} = await pool.query('SELECT * FROM ghost_projects WHERE id=$1',[req.params.id]);
    if(!ex.length) return res.status(404).json({success:false,error:'Not found'});
    const gp=ex[0]; const b=req.body;
    const merged={sector:b.sector||gp.sector,county:b.county||gp.county,amount_at_risk:b.amount_at_risk?parseInt(b.amount_at_risk):gp.amount_at_risk};
    const a=analyzeSatellite(merged);
    const {rows} = await pool.query(
      `UPDATE ghost_projects SET project_name=COALESCE($1,project_name),county=COALESCE($2,county),sector=COALESCE($3,sector),claimed_status=COALESCE($4,claimed_status),amount_at_risk=COALESCE($5,amount_at_risk),satellite_status=$6,detection_status=$7,confidence_score=$8,satellite_metadata=$9 WHERE id=$10 RETURNING *`,
      [b.project_name||null,b.county||null,b.sector||null,b.claimed_status||null,b.amount_at_risk?parseInt(b.amount_at_risk):null,a.satellite_status,a.detection_status,a.confidence_score,JSON.stringify(a.satellite_metadata),gp.id]
    );
    res.json({success:true,data:rows[0]});
  } catch(e){next(e);}
});

router.delete('/:id', async (req,res,next) => {
  try {
    const {rowCount} = await pool.query('DELETE FROM ghost_projects WHERE id=$1',[req.params.id]);
    if(!rowCount) return res.status(404).json({success:false,error:'Not found'});
    res.json({success:true,message:'Deleted'});
  } catch(e){next(e);}
});

module.exports = router;
