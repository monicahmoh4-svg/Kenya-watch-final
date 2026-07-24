const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'supersecretfallback');
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid or expired token.' });
  }
};
