// Frontend port — letta da private_iota_conf.js
let frontendPort = 5173;
try { frontendPort = require('./private_iota_conf').FRONTEND_PORT || 5173; } catch (e) { /* */ }

// Production: set FORUM_URL env var to restrict CORS (e.g. "https://iotapolis.io")
const allowedOrigins = process.env.FORUM_URL
  ? [process.env.FORUM_URL, `http://localhost:${frontendPort}`]
  : [`http://localhost:${frontendPort}`];

module.exports.security = {
  cors: {
    allRoutes: true,
    allowOrigins: allowedOrigins,
    allowCredentials: true,
    allowRequestHeaders: 'content-type, authorization, x-auth-address, x-auth-signature, x-auth-timestamp',
    allowRequestMethods: 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  },
  csrf: false,
};
