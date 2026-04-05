'use strict';
const router = require('express').Router();
const { pool } = require('../db');

function safeJSON(v){try{return Array.isArray(v)?v:JSON.parse(v||'[]');}catch{return[];}}
function scoreReport({type,county,sector,description,amount}){
  let score=40; const kw=[];
  const desc=(description||'').toLowerCase();
  if(desc.length>300)score+=15; else if(desc.length>150)score+=8; else score-=20;
  ['recording','photo','evidence','witness','invoice','title deed','badge number','confirmed by','market quote','multiple sources'].forEach(k=>{if(desc.includes(k)){score+=8;kw.push(k);}});
  ['i think','maybe','rumour','heard that','not sure','vague','possibly'].forEach(k=>{if(desc.includes(k)){score-=10;kw.push('[low]'+k);}});
  if(amount&&amount>0){score+=12;if(amount>1000000)score+=8;}
  if(county)score+=8; if(sector)score+=5; if(type&&type!=='Other')score+=5;
  if(/\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}/.test(desc)){score+=8;kw.push('date mentioned');}
  if(/mr\.|mrs\.|officer|director|manager|official/.test(desc)){score+=10;kw.push('official named');}
  score=Math.min(Math.max(score,5),100);
  const routing={'Bribery / Kickbacks':'DPP','Ghost project / Fake delivery':'EACC','Procurement fraud':'PPRA','Embezzlement of public funds':'EACC','Nepotism / Political appointments':'EACC','Police extortion':'DPP','Land grabbing':'EACC'}[type]||'EACC';
  return {score,routing,keywords:kw};
}

router.get('/', async (req,res,next) => {
  try {
    const {status,county,type,page=1,limit=20}=req.query;
    const conds=[]; const vals=[]; let i=1;
    if(status){conds.push(`status=$${i++}`);vals.push(status);}
    if(county){conds.push(`county ILIKE $${i++}`);vals.push(`%${county}%`);}
    if(type){conds.push(`type ILIKE $${i++}`);vals.push(`%${type}%`);}
    const where=conds.length?'WHERE '+conds.join(' AND '):'';
    const lim=Math.min(100,parseInt(limit)||20);
    const off=(Math.max(1,parseInt(page)||1)-1)*lim;
    const [{rows},{rows:cnt}] = await Promise.all([
      pool.query(`SELECT id,case_number,type,county,sector,status,ai_credibility_score,routing,amount,anonymous,created_at FROM reports ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i+1}`,[...vals,lim,off]),
      pool.query(`SELECT COUNT(*) FROM reports ${where}`,vals)
    ]);
    res.json({success:true,data:rows,total:parseInt(cnt[0].count)});
  } catch(e){next(e);}
});

router.get('/meta/stats', async (req,res,next) => {
  try {
    const {rows} = await pool.query(`SELECT COUNT(*) AS total,COUNT(*) FILTER (WHERE status='pending') AS pending,COUNT(*) FILTER (WHERE status='resolved') AS resolved,COUNT(*) FILTER (WHERE created_at>NOW()-INTERVAL '30 days') AS last_30_days FROM reports`);
    res.json({success:true,data:rows[0]});
  } catch(e){next(e);}
});

router.get('/:id', async (req,res,next) => {
  try {
    const {rows} = await pool.query('SELECT * FROM reports WHERE id=$1 OR case_number=$1',[req.params.id]);
    if(!rows.length) return res.status(404).json({success:false,error:'Not found'});
    const r={...rows[0],keywords:safeJSON(rows[0].keywords)};
    if(r.anonymous) r.description='[REDACTED — anonymous report]';
    res.json({success:true,data:r});
  } catch(e){next(e);}
});

router.post('/', async (req,res,next) => {
  try {
    const {type,county,sector,description,amount,anonymous,related_contract_id}=req.body;
    if(!type||!description) return res.status(400).json({success:false,error:'type and description required'});
    const yr=new Date().getFullYear();
    const case_number=`KW-${yr}-${Math.floor(1000+Math.random()*89999)}`;
    const {score,routing,keywords}=scoreReport({type,county,sector,description,amount:parseInt(amount)});
    const {rows} = await pool.query(
      `INSERT INTO reports (case_number,type,county,sector,description,amount,anonymous,ai_credibility_score,routing,keywords)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,case_number,status,ai_credibility_score,routing,created_at`,
      [case_number,type,county||null,sector||null,description,amount?parseInt(amount):null,anonymous!==false,score,routing,JSON.stringify(keywords)]
    );
    res.status(201).json({success:true,data:rows[0]});
  } catch(e){next(e);}
});

router.patch('/:id/status', async (req,res,next) => {
  try {
    const {status}=req.body;
    const allowed=['pending','reviewing','escalated','resolved','dismissed'];
    if(!allowed.includes(status)) return res.status(400).json({success:false,error:`Status must be: ${allowed.join(', ')}`});
    const {rows} = await pool.query('UPDATE reports SET status=$1,updated_at=NOW() WHERE id=$2 OR case_number=$2 RETURNING id,case_number,status',[status,req.params.id]);
    if(!rows.length) return res.status(404).json({success:false,error:'Not found'});
    res.json({success:true,data:rows[0]});
  } catch(e){next(e);}
});

router.put('/:id', async (req,res,next) => {
  try {
    const {rows:ex} = await pool.query('SELECT * FROM reports WHERE id=$1 OR case_number=$1',[req.params.id]);
    if(!ex.length) return res.status(404).json({success:false,error:'Not found'});
    const r=ex[0]; const b=req.body;
    const merged={type:b.type||r.type,county:b.county||r.county,sector:b.sector||r.sector,description:b.description||r.description,amount:b.amount?parseInt(b.amount):r.amount};
    const {score,routing,keywords}=scoreReport(merged);
    const {rows} = await pool.query('UPDATE reports SET type=$1,county=$2,sector=$3,description=$4,amount=$5,ai_credibility_score=$6,routing=$7,keywords=$8,updated_at=NOW() WHERE id=$9 RETURNING *',[merged.type,merged.county,merged.sector,merged.description,merged.amount,score,routing,JSON.stringify(keywords),r.id]);
    res.json({success:true,data:rows[0]});
  } catch(e){next(e);}
});

router.delete('/:id', async (req,res,next) => {
  try {
    const {rowCount} = await pool.query('DELETE FROM reports WHERE id=$1 OR case_number=$1',[req.params.id]);
    if(!rowCount) return res.status(404).json({success:false,error:'Not found'});
    res.json({success:true,message:'Deleted'});
  } catch(e){next(e);}
});

module.exports = router;
