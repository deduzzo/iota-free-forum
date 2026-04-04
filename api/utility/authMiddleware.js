/**
 * authMiddleware.js — Lightweight Ed25519 auth for private API endpoints.
 *
 * Verifies the caller owns the declared IOTA address by checking:
 * - X-Auth-Address: the IOTA address (0x...)
 * - X-Auth-Signature: base64 Ed25519 signature
 * - X-Auth-Timestamp: Unix ms timestamp (must be within 5 minutes)
 *
 * The signature signs: JSON.stringify({ action: 'auth', address, timestamp })
 */

const db = require('./db');

/**
 * Verify that the request is from the declared user.
 * @param {object} req - Sails/Express request
 * @returns {string|null} Verified IOTA address, or null on failure
 */
async function verifyUser(req) {
  const address = req.headers['x-auth-address'];
  const signature = req.headers['x-auth-signature'];
  const timestamp = parseInt(req.headers['x-auth-timestamp']);

  if (!address || !signature || !timestamp) return null;

  // Check timestamp freshness (5 min window)
  if (Math.abs(Date.now() - timestamp) > 300000) return null;

  try {
    const { Ed25519PublicKey } = await import('@iota/iota-sdk/keypairs/ed25519');
    const Users = db.getModel('users');
    const user = Users.findOne({ id: address });
    if (!user || !user.publicKey) return null;

    const message = JSON.stringify({ action: 'auth', address, timestamp });
    const pubKey = new Ed25519PublicKey(Buffer.from(user.publicKey, 'hex'));
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = Buffer.from(signature, 'base64');
    const valid = await pubKey.verify(msgBytes, sigBytes);
    return valid ? address : null;
  } catch (e) {
    return null;
  }
}

/**
 * Verify that the request is from an admin user.
 * @param {object} req - Sails/Express request
 * @returns {string|null} Verified admin IOTA address, or null on failure
 */
async function verifyAdmin(req) {
  const address = await verifyUser(req);
  if (!address) return null;
  const Users = db.getModel('users');
  const user = Users.findOne({ id: address });
  return (user && user.role === 'admin') ? address : null;
}

module.exports = { verifyUser, verifyAdmin };
