let backendPort = 1337;
try { backendPort = require('./private_iota_conf').PORT || 1337; } catch (e) {}

module.exports.custom = {
  // Porte: configurate in config/private_iota_conf.js (PORT, FRONTEND_PORT)
  baseUrl: `http://localhost:${backendPort}`,
  // Set FORUM_URL env var in production (e.g. "https://iotapolis.io")
  forumUrl: process.env.FORUM_URL || null,

  forumName: 'IotaPolis',
  postsPerPage: 20,
  threadsPerPage: 20,
  rateLimits: {
    post: { windowMs: 10000, max: 1 },
    register: { windowMs: 60000, max: 1 },
    vote: { windowMs: 2000, max: 1 },
    default: { windowMs: 5000, max: 1 },
  },
};
