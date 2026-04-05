'use strict';
const router = require('express').Router();
const https  = require('https');

const SYSTEM=`You are KenyaWatch AI, Kenya's anti-corruption intelligence assistant.
Help users report corruption, understand procurement fraud, track ghost projects, and connect to EACC/DPP/PPRA.
Be warm, concise (under 200 words), Kenya-specific. Use **bold** for key info.
EACC Hotline: 0800 720 880. Respond in user's language (English or Kiswahili).`;

function callAI(messages){
  return new Promise(resolve=>{
    const key=process.env.ANTHROPIC_API_KEY;
    if(!key)return resolve({ok:false,text:fallback(messages[messages.length-1]?.content||'')});
    const body=JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:500,system:SYSTEM,messages});
    const opts={hostname:'api.anthropic.com',path:'/v1/messages',method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(body)}};
    const req=https.request(opts,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{const p=JSON.parse(d);resolve({ok:!p.error,text:p.error?fallback('',p.error.message):p.content?.map(b=>b.text||'').join('')||''});}catch{resolve({ok:false,text:fallback('')});}});});
    req.on('error',()=>resolve({ok:false,text:fallback('')}));
    req.setTimeout(20000,()=>{req.destroy();resolve({ok:false,text:'Request timed out. Please try again.'});});
    req.write(body);req.end();
  });
}

function fallback(msg,err=''){
  if(err.includes('401'))return '⚠️ AI needs setup. Admin: add **ANTHROPIC_API_KEY** in Railway Variables.';
  const m=(msg||'').toLowerCase();
  if(m.includes('report')||m.includes('bribe'))return 'To report corruption anonymously:\n\n1. Click **🚨 Report** in the menu\n2. Fill details — identity never stored\n3. AI routes to **EACC, DPP or PPRA**\n\n**EACC: 0800 720 880** (free, 24/7)';
  if(m.includes('contract')||m.includes('tender'))return 'To scan contracts:\n\nGo to **📋 Procurement** → click **+ Scan Contract**\n\nAI scores 0-100. Score ≥75 = **HIGH RISK** — auto-escalated to EACC.';
  if(m.includes('ghost')||m.includes('satellite'))return '**Ghost Project Detector** uses satellite imagery:\n\n• **GHOST** — No structure built\n• **PARTIAL** — Incomplete\n• **VERIFIED** — Confirmed\n\nCheck **👻 Ghost Projects** tab.';
  if(m.includes('hello')||m.includes('hi')||m.includes('habari')||m.includes('hujambo'))return '**Habari! I\'m KenyaWatch AI** 👋\n\nI help with:\n• Anonymous corruption reporting\n• Contract fraud analysis\n• Ghost project tracking\n• EACC, DPP, PPRA connections\n\nHow can I help?';
  return 'I\'m **KenyaWatch AI** — your Kenya anti-corruption assistant.\n\nAsk me about contracts, corruption, or ghost projects.\n\n**EACC: 0800 720 880**';
}

const sessions=new Map();
function getH(sid){return sessions.get(sid)||[];}
function addH(sid,role,content){const h=getH(sid);h.push({role,content});while(h.length>16)h.shift();sessions.set(sid,h);}

router.post('/message',async(req,res)=>{
  try{
    const{message,session_id}=req.body;
    if(!message?.trim())return res.status(400).json({success:false,error:'message required'});
    const sid=session_id||'anon';
    const msg=message.trim().slice(0,800);
    addH(sid,'user',msg);
    const{ok,text}=await callAI(getH(sid));
    addH(sid,'assistant',text);
    res.json({success:true,reply:text,fallback:!ok,session_id:sid});
  }catch(e){res.json({success:true,reply:fallback(req.body?.message||''),fallback:true});}
});

router.get('/history/:sid',(req,res)=>res.json({success:true,data:getH(req.params.sid)}));
router.delete('/history/:sid',(req,res)=>{sessions.delete(req.params.sid);res.json({success:true});});
router.get('/status',(req,res)=>res.json({success:true,ai_enabled:!!process.env.ANTHROPIC_API_KEY,sessions:sessions.size}));

module.exports=router;
