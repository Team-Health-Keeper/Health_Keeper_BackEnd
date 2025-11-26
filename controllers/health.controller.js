// Example controller structure
// You can expand this pattern for other controllers

const getHealthStatus = (req, res) => {
  res.json({
    success: true,
    message: 'Health check passed',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};

module.exports = {
  getHealthStatus
};

