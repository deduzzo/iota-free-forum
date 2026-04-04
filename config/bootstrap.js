/**
 * bootstrap.js — Startup logic for IotaPolis (INDEXER MODE)
 *
 * The backend is now a pure indexer. It does NOT sign or publish transactions.
 * Users sign TX directly with their own IOTA wallet.
 *
 * 1. Initialize SQLite database (with new payment/marketplace tables)
 * 2. Initialize IOTA wallet (for faucet operations only)
 * 3. Start blockchain sync in background (indexer)
 * 4. Start polling + auto-repair for eventual consistency
 * 5. Auto-refill faucet wallet on testnet/devnet
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../api/utility/db');

// Electron sets FORUM_DATA_DIR to appdata; otherwise use config/
const CONFIG_PATH = process.env.FORUM_DATA_DIR
  ? path.join(process.env.FORUM_DATA_DIR, 'private_iota_conf.js')
  : path.resolve(__dirname, 'private_iota_conf.js');

/**
 * Auto-generate private_iota_conf.js if it doesn't exist.
 * In the new architecture, RSA keys are no longer needed for user auth
 * (users sign with Ed25519 via IOTA SDK). RSA keys are kept for legacy
 * compatibility but are not used for new operations.
 */
function ensureConfigFile() {
  if (fs.existsSync(CONFIG_PATH)) return;

  console.log('[bootstrap] private_iota_conf.js not found — generating...');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const escPub = publicKey.replace(/\n/g, '\\n');
  const escPriv = privateKey.replace(/\n/g, '\\n');

  const content = `// Auto-generated configuration — IotaPolis
// Generated: ${new Date().toISOString()}
// DO NOT commit this file (it's in .gitignore)

module.exports = {
  // ── Porte ──────────────────────────────────────────────────────
  // Backend (Sails.js)
  PORT: 1337,
  // Frontend (Vite dev server)
  FRONTEND_PORT: 5173,

  // ── Rete IOTA ─────────────────────────────────────────────────
  // 'testnet' | 'mainnet' | 'devnet'
  IOTA_NETWORK: 'testnet',

  // URL nodo custom (null = usa il default della rete)
  IOTA_NODE_URL: null,

  // Mnemonic BIP39 — generato automaticamente al primo avvio
  // This wallet is used ONLY for faucet operations (sending gas to new users)
  IOTA_MNEMONIC: null,

  // ── Chiavi RSA-2048 (LEGACY — not used in new architecture) ────
  MAIN_PRIVATE_KEY: '${escPriv}',
  MAIN_PUBLIC_KEY: '${escPub}',

  // ── Move Contract ────────────────────────────────────────────
  // Set after deploying with: node api/utility/move-publish.js
  FORUM_PACKAGE_ID: null,
  FORUM_OBJECT_ID: null,
  FORUM_REGISTRY_ID: null,
  FORUM_TREASURY_ID: null,
  FORUM_SUBSCRIPTION_STORE_ID: null,
  FORUM_MARKETPLACE_STORE_ID: null,
  ADMIN_CAP_ID: null,

  // ── Explorer ──────────────────────────────────────────────────
  IOTA_EXPLORER_URL: 'https://explorer.rebased.iota.org',
};
`;

  fs.writeFileSync(CONFIG_PATH, content, 'utf8');
  console.log('[bootstrap] private_iota_conf.js created');

  // Clear require cache so iota.js picks up the new file
  delete require.cache[require.resolve('./private_iota_conf')];
}

module.exports.bootstrap = async function (done) {
  const log = sails.log || console;

  // 0. Ensure config file exists
  ensureConfigFile();

  console.log('[bootstrap] Starting IotaPolis bootstrap (INDEXER MODE)...');

  // 1. Initialize SQLite cache (with new payment/marketplace tables)
  try {
    db.initDb();
    console.log('[bootstrap] Step 1/3: SQLite database initialized (including payment tables)');
    log.info('[bootstrap] SQLite database initialized');
  } catch (err) {
    console.log('[bootstrap] FATAL: Failed to initialize database:', err.message);
    log.error('[bootstrap] Failed to initialize database:', err.message);
    return done(err);
  }

  // 2. Initialize IOTA wallet (used ONLY for faucet operations)
  try {
    const iota = require('../api/utility/iota');
    if (typeof iota.getOrInitWallet === 'function') {
      const walletResult = await iota.getOrInitWallet();
      console.log('[bootstrap] Step 2/3: IOTA wallet initialized (faucet only). Address:', walletResult.address || 'N/A');
      log.info('[bootstrap] IOTA wallet:', walletResult.address || 'initialized');

      // Wait for gas coins to be available before proceeding
      if (walletResult.init) {
        console.log('[bootstrap] New wallet — waiting for faucet funds...');
        const funds = await iota.waitForFunds(30000);
        if (funds.ready) {
          console.log(`[bootstrap] Wallet funded: ${funds.coins} coins, ${funds.balance} nanos`);
        } else {
          console.log('[bootstrap] WARNING: Wallet not funded yet. Faucet requests will fail until funds arrive.');
        }
      } else {
        // Existing wallet — quick check
        const funds = await iota.waitForFunds(5000);
        if (!funds.ready) {
          console.log('[bootstrap] WARNING: No gas coins available. Requesting faucet...');
        }
      }
    } else {
      console.log('[bootstrap] Step 2/3: IOTA wallet init skipped (getOrInitWallet not available)');
    }
  } catch (err) {
    console.log('[bootstrap] Step 2/3: IOTA wallet init skipped:', err.message);
    log.warn('[bootstrap] IOTA wallet init skipped:', err.message);
  }

  // 3. Start blockchain sync in background (INDEXER — read-only, no publishing)
  try {
    const ForumManager = require('../api/utility/ForumManager');
    console.log('[bootstrap] Step 3/3: Starting blockchain sync (indexer mode)...');
    if (typeof ForumManager.syncFromBlockchain === 'function') {
      ForumManager.syncFromBlockchain().then(async () => {
        console.log('[bootstrap] Blockchain sync completed successfully');
        log.info('[bootstrap] Blockchain sync completed');

        // Try real-time subscription with timeout, fall back to polling
        let subscribed = false;
        try {
          const subPromise = ForumManager.startRealtimeSubscription();
          const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Subscription timeout (10s)')), 10000));
          subscribed = await Promise.race([subPromise, timeout]);
          if (subscribed) {
            console.log('[bootstrap] Real-time blockchain subscription active');
          }
        } catch (subErr) {
          console.log('[bootstrap] RT subscription failed:', subErr.message);
        }

        // Always start polling as fallback/complement (30s)
        try {
          await ForumManager.initEventCursor();
          setInterval(() => {
            ForumManager.pollNewEvents().catch(err => {
              sails.log.warn('[poll] Error:', err.message);
            });
          }, 30000);
          console.log('[bootstrap] Blockchain polling started (30s interval)');

          // Auto-repair: check and fix missing data every 60s
          setInterval(() => {
            ForumManager.repairSync().catch(err => {
              sails.log.warn('[repair] Error:', err.message);
            });
          }, 60000);
          // First repair after 10s to catch any issues from initial sync
          setTimeout(() => {
            ForumManager.repairSync().catch(err => {
              sails.log.warn('[repair] Error:', err.message);
            });
          }, 10000);
          console.log('[bootstrap] Auto-repair started (60s interval, first run in 10s)');
        } catch (cursorErr) {
          console.log('[bootstrap] Event cursor init failed:', cursorErr.message);
        }
      }).catch((err) => {
        console.log('[bootstrap] Blockchain sync failed:', err.message);
        log.warn('[bootstrap] Blockchain sync failed:', err.message);
      });
    } else {
      console.log('[bootstrap] ForumManager.syncFromBlockchain is not a function, skipping');
    }
  } catch (err) {
    console.log('[bootstrap] ForumManager not available, skipping sync:', err.message);
    log.warn('[bootstrap] ForumManager not available, skipping sync');
  }

  // NOTE: TX retry queue processor REMOVED — backend no longer publishes transactions.
  // Users sign and submit TX directly to the blockchain with their own wallet.

  // 4. Auto-refill faucet wallet on testnet/devnet when balance is low
  // The faucet wallet is the ONLY thing the backend wallet is used for now.
  try {
    const iota = require('../api/utility/iota');
    const config = require('./private_iota_conf');
    const network = config.IOTA_NETWORK || 'testnet';

    if (network === 'testnet' || network === 'devnet') {
      // Check balance every 60 seconds, request faucet if low
      const MIN_BALANCE_NANOS = BigInt(1000000000); // 1 IOTA
      const checkAndRefill = async () => {
        try {
          const status = await iota.getStatusAndBalance();
          const balanceStr = status.balance || '0';
          // Extract nanos from "X.XXX nanos [Y IOTA]" format
          const nanosMatch = balanceStr.match(/^([\d.]+)\s*nanos/);
          const nanos = nanosMatch ? BigInt(nanosMatch[1].replace(/\./g, '')) : BigInt(0);

          if (nanos < MIN_BALANCE_NANOS) {
            console.log(`[faucet-monitor] Balance low: ${balanceStr}. Requesting faucet...`);
            await iota.requestFaucet();
            console.log('[faucet-monitor] Faucet funds requested');
          }
        } catch (e) {
          // Silently ignore — faucet may be rate-limited
        }
      };
      // Check on startup after 5s delay, then every 60s
      setTimeout(checkAndRefill, 5000);
      setInterval(checkAndRefill, 60000);
      console.log('[bootstrap] Faucet auto-refill monitor started (testnet/devnet, every 60s)');
    } else {
      console.log(`[bootstrap] Network: ${network} — faucet auto-refill disabled (mainnet)`);
      console.log('[bootstrap] WARNING: Ensure faucet wallet has sufficient IOTA balance!');
    }
  } catch (err) {
    console.log('[bootstrap] Faucet monitor not started:', err.message);
  }

  console.log('[bootstrap] Bootstrap complete (INDEXER MODE). Sails is lifting...');
  done();
};
