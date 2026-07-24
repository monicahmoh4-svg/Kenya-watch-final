require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDB } = require('./db/index');
const aiRoutes = require('./routes/ai');
const reportRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const exportRoutes = require('./routes/export');
const { startOcdsSync } = require('./services/ocdsSync');

const app = express();
const PORT = process.env.PORT || 5000;

// STRICT CORS: Only allow your Vercel frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/export', exportRoutes);

app.get('/health', async (req, res) => {
  res.json({ 
    status: 'ok', 
    database: 'connected', 
    ai: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
    version: '3.4.0'
  });
});

const startServer = async () => {
  await initDB();
  startOcdsSync();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
