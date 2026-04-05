require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const { initDB, pool } = require('./db');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin:'*', methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders:['Content-Type','Authorization'] }));
app.options('*', cors());
app.use('/api/ai',      rateLimit({ windowMs:60000, max:40 }));
app.use('/api/chatbot', rateLimit({ windowMs:60000, max:40 }));
app.use('/api',         rateLimit({ windowMs:60000, max:300 }));
app.use(express.json({ limit:'10kb' }));
app.use(express.urlencoded({ extended:true }));

// Request logger
app.use((req,res,next)=>{
  const t=Date.now();
  res.on('finish',()=>console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now()-t}ms`));
  next();
});

// Static admin panel
app.use('/admin', express.static(path.join(__dirname,'admin')));
app.get('/admin', (req,res)=>res.sendFile(path.join(__dirname,'admin','index.html')));

// Health check
app.get('/health', async (req,res)=>{
  let db=false;
  try{await pool.query('SELECT 1');db=true;}catch{}
  res.status(db?200:503).json({
    status:db?'ok':'degraded', database:db?'connected':'disconnected',
    ai:process.env.ANTHROPIC_API_KEY?'configured':'missing_api_key',
    timestamp:new Date().toISOString(), version:'3.0.0'
  });
});

// Root
app.get('/', (req,res)=>res.json({
  name:'KenyaWatch AI Backend', version:'3.0.0',
  status:'running', admin:'/admin', health:'/health',
  endpoints:['/api/contracts','/api/reports','/api/ghost-projects','/api/ai','/api/chatbot','/api/stats']
}));

// API routes
app.use('/api/contracts',      require('./routes/contracts'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/ghost-projects', require('./routes/ghostProjects'));
app.use('/api/ai',             require('./routes/ai'));
app.use('/api/chatbot',        require('./routes/chatbot'));

// Dashboard stats
app.get('/api/stats', async (req,res,next)=>{
  try {
    const [c,r,g]=await Promise.all([
      pool.query(`SELECT COUNT(*) FILTER (WHERE risk_level='HIGH') AS flagged,COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS funds,COUNT(*) AS total FROM contracts`),
      pool.query(`SELECT COUNT(*) AS total FROM reports WHERE created_at>NOW()-INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE detection_status IN ('ghost','partial')) AS cnt FROM ghost_projects`)
    ]);
    res.json({success:true,data:{contracts_flagged:parseInt(c.rows[0].flagged),contracts_total:parseInt(c.rows[0].total),ghost_projects:parseInt(g.rows[0].cnt),reports_30d:parseInt(r.rows[0].total),funds_at_risk:parseInt(c.rows[0].funds)}});
  } catch(e){next(e);}
});

// Error handlers
app.use((req,res)=>res.status(404).json({success:false,error:`Route ${req.method} ${req.path} not found`}));
app.use((err,req,res,next)=>{console.error(err.message);res.status(err.status||500).json({success:false,error:err.message});});

const start=async()=>{
  try {
    await initDB();
    app.listen(PORT,'0.0.0.0',()=>{
      console.log(`🚀 KenyaWatch AI v3.0 on port ${PORT}`);
      console.log(`🤖 AI: ${process.env.ANTHROPIC_API_KEY?'ready':'⚠️ ANTHROPIC_API_KEY missing'}`);
    });
  } catch(e){console.error('Startup failed:',e.message);process.exit(1);}
};

start();
