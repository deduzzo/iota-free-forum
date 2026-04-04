/**
 * api-sync-reset.js — Drop and recreate the cache database, then resync from blockchain.
 *
 * SECURITY: Requires admin authentication. The request must include
 * an adminAddress that matches an admin user in the database.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API Sync Reset',
  description: 'Drop and recreate the cache database, then resync from blockchain. Requires admin.',

  inputs: {
    resync: { type: 'boolean', defaultsTo: false, description: 'If true, resync from blockchain after clearing. If false, just clear.' },
    adminAddress: { type: 'string', required: true, description: 'IOTA address of the admin requesting the reset' },
    timestamp: { type: 'number', required: true, description: 'Current timestamp for freshness check' },
    signature: { type: 'string', required: true, description: 'Ed25519 signature proving admin identity' },
  },

  exits: {
    success: { statusCode: 200 },
    forbidden: { statusCode: 403 },
    badRequest: { statusCode: 400 },
  },

  fn: async function (inputs) {
    try {
      // 1. Verify admin identity
      const Users = db.getModel('users');
      const admin = Users.findOne({ id: inputs.adminAddress });
      if (!admin || admin.role !== 'admin') {
        sails.log.warn(`[sync-reset] Unauthorized attempt from: ${inputs.adminAddress}`);
        this.res.status(403);
        return { success: false, error: 'Access denied. Only admin can perform sync reset.' };
      }

      // 2. Verify timestamp freshness (5 minute window)
      const now = Date.now();
      if (Math.abs(now - inputs.timestamp) > 300000) {
        this.res.status(400);
        return { success: false, error: 'Request expired. Timestamp must be within 5 minutes.' };
      }

      // 3. Verify Ed25519 signature
      try {
        const { Ed25519PublicKey } = await import('@iota/iota-sdk/keypairs/ed25519');
        if (!admin.publicKey) {
          this.res.status(403);
          return { success: false, error: 'Admin has no registered Ed25519 public key' };
        }
        const message = JSON.stringify({
          action: 'sync-reset',
          adminAddress: inputs.adminAddress,
          timestamp: inputs.timestamp,
        });
        const pubKey = new Ed25519PublicKey(Buffer.from(admin.publicKey, 'hex'));
        const msgBytes = new TextEncoder().encode(message);
        const sigBytes = Buffer.from(inputs.signature, 'base64');
        const valid = await pubKey.verify(msgBytes, sigBytes);
        if (!valid) {
          this.res.status(403);
          return { success: false, error: 'Invalid Ed25519 signature' };
        }
      } catch (verifyErr) {
        sails.log.error(`[sync-reset] Signature verification failed: ${verifyErr.message}`);
        this.res.status(403);
        return { success: false, error: 'Signature verification failed' };
      }

      sails.log.info(`[sync-reset] Authorized by admin: ${admin.username} (${inputs.adminAddress})`);

      // 4. Drop all tables and recreate schema (including new payment tables)
      const database = db.getDb();
      database.exec(`
        DELETE FROM users;
        DELETE FROM categories;
        DELETE FROM threads;
        DELETE FROM posts;
        DELETE FROM votes;
        DELETE FROM roles;
        DELETE FROM moderations;
        DELETE FROM config;
        DELETE FROM seen_nonces;
        DELETE FROM wallets;
        DELETE FROM subscriptions;
        DELETE FROM escrows;
        DELETE FROM reputations;
        DELETE FROM tips;
        DELETE FROM purchases;
        DELETE FROM badges_config;
        DELETE FROM user_badges;
        DELETE FROM ratings;
        DELETE FROM transaction_log;
        INSERT INTO search_index(search_index) VALUES('delete-all');
      `);

      // Also clear retry queue
      try {
        database.exec('DROP TABLE IF EXISTS tx_retry_queue');
      } catch (e) { /* table might not exist */ }

      sails.log.info('[sync-reset] Cache cleared completely');

      // Only resync if explicitly requested
      if (inputs.resync) {
        try {
          const ForumManager = require('../utility/ForumManager');
          if (ForumManager && typeof ForumManager.syncFromBlockchain === 'function') {
            ForumManager.syncFromBlockchain().then(() => {
              sails.log.info('[sync-reset] Resync completed');
            }).catch((err) => {
              sails.log.warn('[sync-reset] Resync failed:', err.message);
            });
          }
        } catch (e) {
          sails.log.warn('[sync-reset] ForumManager not available for resync');
        }
      }

      // Broadcast
      await sails.helpers.broadcastEvent('dataChanged', {
        action: 'syncReset',
        label: 'Cache cleared and resync started',
      });

      return {
        success: true,
        message: inputs.resync ? 'Cache cleared. Resync started in background.' : 'Cache cleared. No resync.',
        resyncing: inputs.resync,
      };
    } catch (err) {
      sails.log.error('[api-sync-reset]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
