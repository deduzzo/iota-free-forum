/**
 * full-reset.js — Full forum reset: new wallet, empty database, fresh start.
 *
 * SECURITY: Requires admin authentication via signed message.
 * The request must include an `adminAddress` and `signature` proving
 * the caller owns the admin address on the blockchain.
 *
 * This generates a new IOTA mnemonic/wallet, clears the SQLite cache,
 * and resets the forum to a blank state. On-chain data from the old
 * wallet remains but is no longer associated with this instance.
 */
const fs = require('fs');
const path = require('path');
const db = require('../utility/db');

const CONFIG_PATH = process.env.FORUM_DATA_DIR
  ? path.join(process.env.FORUM_DATA_DIR, 'private_iota_conf.js')
  : path.resolve(__dirname, '../../config/private_iota_conf.js');

module.exports = {
  friendlyName: 'Full Reset',
  description: 'Generate new wallet + clear all data. Forum restarts from scratch. Requires admin.',

  inputs: {
    adminAddress: { type: 'string', required: true, description: 'IOTA address of the admin requesting the reset' },
    timestamp: { type: 'number', required: true, description: 'Current timestamp for freshness check' },
    signature: { type: 'string', required: true, description: 'Ed25519 signature of the request payload' },
  },

  exits: {
    success: { statusCode: 200 },
    forbidden: { statusCode: 403 },
    unauthorized: { statusCode: 401 },
    badRequest: { statusCode: 400 },
  },

  fn: async function (inputs) {
    try {
      // 1. Auth check: if forum has users, require admin; if empty, allow freely
      const Users = db.getModel('users');
      const userCount = Users.count();

      if (userCount > 0) {
        const admin = Users.findOne({ id: inputs.adminAddress });
        if (!admin || admin.role !== 'admin') {
          this.res.status(403);
          return { success: false, error: 'Access denied. Only admin can perform full reset.' };
        }
        // 2. Verify timestamp freshness (5 minute window to prevent replay attacks)
        const now = Date.now();
        if (Math.abs(now - inputs.timestamp) > 300000) {
          this.res.status(400);
          return { success: false, error: 'Request expired. Timestamp must be within 5 minutes.' };
        }

        // 3. Verify Ed25519 signature
        try {
          const { Ed25519PublicKey } = await import('@iota/iota-sdk/keypairs/ed25519');
          if (!admin.publicKey) {
            this.res.status(401);
            return { success: false, error: 'Admin has no registered Ed25519 public key.' };
          }
          const message = JSON.stringify({
            action: 'full-reset',
            adminAddress: inputs.adminAddress,
            timestamp: inputs.timestamp,
          });
          const pubKey = new Ed25519PublicKey(Buffer.from(admin.publicKey, 'hex'));
          const msgBytes = new TextEncoder().encode(message);
          const sigBytes = Buffer.from(inputs.signature, 'base64');
          const valid = await pubKey.verify(msgBytes, sigBytes);
          if (!valid) {
            this.res.status(401);
            return { success: false, error: 'Invalid Ed25519 signature.' };
          }
        } catch (verifyErr) {
          console.error(`[full-reset] Signature verification failed: ${verifyErr.message}`);
          this.res.status(401);
          return { success: false, error: 'Signature verification failed.' };
        }

        console.log('[full-reset] Starting full reset (authorized by admin:', inputs.adminAddress, ')...');
      } else {
        console.log('[full-reset] Starting full reset (empty forum)...');
      }

      // 4. Clear all SQLite tables (including new payment tables)
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
        INSERT INTO search_index(search_index) VALUES('delete-all');
      `);
      try { database.exec('DROP TABLE IF EXISTS tx_retry_queue'); } catch (e) { /* */ }
      console.log('[full-reset] Database cleared');

      // 5. Generate new mnemonic and overwrite config
      const iota = require('../utility/iota');
      const sdk = await iota.loadSdk();
      const { generateMnemonic } = await import('@scure/bip39');
      const { wordlist } = await import('@scure/bip39/wordlists/english.js');
      const newMnemonic = generateMnemonic(wordlist);

      const kp = sdk.Ed25519Keypair.deriveKeypair(newMnemonic);
      const newAddress = kp.getPublicKey().toIotaAddress();
      console.log('[full-reset] New wallet address:', newAddress);

      // 6. Overwrite mnemonic in config file
      try {
        let content = fs.readFileSync(CONFIG_PATH, 'utf8');
        content = content.replace(
          /IOTA_MNEMONIC:\s*(?:null|'[^']*')/,
          `IOTA_MNEMONIC: '${newMnemonic}'`
        );
        fs.writeFileSync(CONFIG_PATH, content, 'utf8');
        console.log('[full-reset] Config file updated with new mnemonic');
      } catch (e) {
        console.error('[full-reset] Could not update config file:', e.message);
        return {
          success: false,
          error: 'Could not write new mnemonic to config. Manual update needed.',
        };
      }

      // 7. Clear Move contract IDs (new wallet = need to re-deploy)
      try {
        let content = fs.readFileSync(CONFIG_PATH, 'utf8');
        content = content.replace(/FORUM_PACKAGE_ID:\s*'[^']*'/, "FORUM_PACKAGE_ID: null");
        content = content.replace(/FORUM_OBJECT_ID:\s*'[^']*'/, "FORUM_OBJECT_ID: null");
        content = content.replace(/FORUM_REGISTRY_ID:\s*'[^']*'/, "FORUM_REGISTRY_ID: null");
        content = content.replace(/FORUM_TREASURY_ID:\s*'[^']*'/, "FORUM_TREASURY_ID: null");
        content = content.replace(/FORUM_SUBSCRIPTION_STORE_ID:\s*'[^']*'/, "FORUM_SUBSCRIPTION_STORE_ID: null");
        content = content.replace(/FORUM_MARKETPLACE_STORE_ID:\s*'[^']*'/, "FORUM_MARKETPLACE_STORE_ID: null");
        content = content.replace(/ADMIN_CAP_ID:\s*'[^']*'/, "ADMIN_CAP_ID: null");
        fs.writeFileSync(CONFIG_PATH, content, 'utf8');
        console.log('[full-reset] Move contract IDs cleared');
      } catch (e) {
        console.log('[full-reset] Move config clear warning:', e.message);
      }

      // 8. Reset iota.js runtime state so it picks up the new mnemonic
      iota._resetRuntime();
      console.log('[full-reset] IOTA runtime reset');

      // 9. Re-initialize wallet (request faucet funds) and wait for them
      try {
        const walletResult = await iota.getOrInitWallet();
        console.log('[full-reset] New wallet initialized:', walletResult.address);

        console.log('[full-reset] Waiting for faucet funds...');
        const funds = await iota.waitForFunds(30000);
        if (funds.ready) {
          console.log(`[full-reset] Wallet funded: ${funds.coins} coins`);
        } else {
          console.log('[full-reset] WARNING: Funds not yet available.');
        }
      } catch (e) {
        console.log('[full-reset] Wallet re-init warning:', e.message);
      }

      // Broadcast
      try {
        await sails.helpers.broadcastEvent('dataChanged', {
          action: 'fullReset',
          label: 'Full reset completed — new wallet created',
        });
      } catch (e) { /* */ }

      console.log('[full-reset] Full reset complete. New address:', newAddress);

      return {
        success: true,
        newAddress,
        needsMoveDeploy: true,
        message: 'Full reset complete. New wallet generated. Run `npm run move:deploy` to deploy a new smart contract, then restart the server.',
      };
    } catch (err) {
      console.error('[full-reset] Error:', err.message, err.stack);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
