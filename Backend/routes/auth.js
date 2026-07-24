const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

// In production, fetch this from DB. For now, using env vars for simplicity.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || '$2a$10$YourHashedPasswordHere'; // Generate via bcrypt.hashSync('yourpassword', 10)

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER) return res.status(400).json({ error: 'Invalid credentials' });

  // If you haven't hashed it yet, replace next line with: if (password !== 'yourplaintextpassword')
  const isValid = await bcrypt.compare(password, ADMIN_PASS_HASH); 
  if (!isValid) return res.status(400).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'supersecretfallback', { expiresIn: '24h' });
  res.json({ token, message: 'Login successful' });
});

module.exports = router;
