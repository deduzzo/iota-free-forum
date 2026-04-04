let frontendPort = 5173;
try { frontendPort = require('./private_iota_conf').FRONTEND_PORT || 5173; } catch (e) {}

module.exports.sockets = {
  transports: ['websocket', 'polling'],
  onlyAllowOrigins: process.env.FORUM_URL
    ? [process.env.FORUM_URL, `http://localhost:${frontendPort}`]
    : [`http://localhost:${frontendPort}`],
  // NOTE: beforeConnect allows all connections because WebSocket broadcasts only contain
  // entity type + action metadata (e.g. { entity: 'thread', action: 'created' }),
  // never private user data. Clients must still authenticate via API to read actual data.
  beforeConnect: function (handshake, cb) {
    return cb(null, true);
  },
};
