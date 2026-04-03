const errorHandler = (err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ success: false, error: err.message });
};

const notFound = (req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
};

module.exports = { errorHandler, notFound };
