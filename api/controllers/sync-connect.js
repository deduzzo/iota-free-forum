/**
 * sync-connect.js — Connect to an existing forum by its Move contract IDs.
 *
 * Connection string format (new): network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId
 * Legacy format (3 parts): network:packageId:forumObjectId
 * Deprecated format (2 parts): network:address
 */
const fs = require('fs');
const path = require('path');
const db = require('../utility/db');
const { verifyAdmin } = require('../utility/authMiddleware');

const CONFIG_PATH = path.resolve(__dirname, '../../config/private_iota_conf.js');

module.exports = {
  friendlyName: 'Sync Connect',
  description: 'Connect to a remote forum by its Move contract Package ID and shared object IDs.',

  inputs: {
    connectionString: { type: 'string', required: true },
  },

  exits: {
    success: { statusCode: 200 },
    badRequest: { statusCode: 400 },
  },

  fn: async function (inputs) {
    // Auth: if users exist in DB, require admin authentication via Ed25519 signature
    const Users = db.getModel('users');
    const userCount = Users.count();
    if (userCount > 0) {
      const admin = await verifyAdmin(this.req);
      if (!admin) {
        this.res.status(403);
        return { success: false, error: 'Access denied. Admin authentication required (forum has users).' };
      }
      console.log(`[sync-connect] Authorized by admin: ${admin}`);
    }

    const raw = inputs.connectionString.trim();
    const parts = raw.split(':');

    // Parse connection string
    let network, packageId, forumObjectId, registryId, treasuryId, subscriptionStoreId, marketplaceStoreId, governanceStoreId;

    if (parts.length === 8) {
      // New format with governance: network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId:governanceStoreId
      [network, packageId, forumObjectId, registryId, treasuryId, subscriptionStoreId, marketplaceStoreId, governanceStoreId] = parts;
    } else if (parts.length === 7) {
      // Format without governance: network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId
      [network, packageId, forumObjectId, registryId, treasuryId, subscriptionStoreId, marketplaceStoreId] = parts;
    } else if (parts.length === 3) {
      // Legacy format: network:packageId:forumObjectId (no separate shared objects)
      [network, packageId, forumObjectId] = parts;
    } else if (parts.length === 2) {
      // Deprecated: network:address
      return {
        success: false,
        error: 'Formato legacy non supportato. Usa il formato: network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId',
      };
    } else {
      throw 'badRequest';
    }

    if (!packageId.startsWith('0x') || !forumObjectId.startsWith('0x')) {
      return { success: false, error: 'Package ID e Forum Object ID devono iniziare con 0x' };
    }

    console.log(`[sync-connect] Connecting to forum: ${network}:${packageId}:${forumObjectId}`);

    try {
      const iota = require('../utility/iota');
      const sdk = await iota.loadSdk();

      // Create a client for the specified network
      const nodeUrl = network === 'mainnet'
        ? 'https://api.mainnet.iota.cafe'
        : network === 'devnet'
          ? 'https://api.devnet.iota.cafe'
          : 'https://api.testnet.iota.cafe';

      const client = new sdk.IotaClient({ url: nodeUrl });

      // Verify the forum exists by querying its events
      let totalEvents = 0;
      try {
        const result = await client.queryEvents({
          query: { MoveModule: { package: packageId, module: 'forum' } },
          limit: 1,
        });
        totalEvents = result.data.length;
        // If we got a result, the contract exists
        if (result.data.length === 0 && !result.hasNextPage) {
          // Contract exists but no events yet — check if the object exists
          try {
            await client.getObject({ id: forumObjectId, options: { showContent: true } });
            totalEvents = 0; // Object exists, just no events
          } catch {
            return {
              success: false,
              error: 'Forum Object non trovato sulla blockchain. Verifica l\'ID.',
            };
          }
        }
      } catch (queryErr) {
        console.log('[sync-connect] Query error:', queryErr.message);
        return {
          success: false,
          error: `Impossibile interrogare il contratto: ${queryErr.message}`,
        };
      }

      // Count total events
      if (totalEvents > 0) {
        let cursor = null;
        let hasMore = true;
        totalEvents = 0;
        while (hasMore && totalEvents < 1000) {
          const r = await client.queryEvents({
            query: { MoveModule: { package: packageId, module: 'forum' } },
            limit: 50,
            cursor,
          });
          totalEvents += r.data.length;
          hasMore = r.hasNextPage;
          cursor = r.nextCursor;
        }
      }

      console.log(`[sync-connect] Found ${totalEvents} events from contract ${packageId}`);

      // Save to config
      _saveToConfig('FORUM_PACKAGE_ID', packageId);
      _saveToConfig('FORUM_OBJECT_ID', forumObjectId);
      if (registryId) _saveToConfig('FORUM_REGISTRY_ID', registryId);
      if (treasuryId) _saveToConfig('FORUM_TREASURY_ID', treasuryId);
      if (subscriptionStoreId) _saveToConfig('FORUM_SUBSCRIPTION_STORE_ID', subscriptionStoreId);
      if (marketplaceStoreId) _saveToConfig('FORUM_MARKETPLACE_STORE_ID', marketplaceStoreId);
      if (governanceStoreId) _saveToConfig('FORUM_GOVERNANCE_STORE_ID', governanceStoreId);
      // No ADMIN_CAP_ID — only the deployer has it

      // Reload config in iota.js
      iota._resetRuntime();

      // Sync from blockchain — populate local cache with all forum data
      let syncStats = null;
      if (totalEvents > 0) {
        try {
          console.log('[sync-connect] Starting blockchain sync...');
          const ForumManager = require('../utility/ForumManager');
          syncStats = await ForumManager.syncFromBlockchain();
          console.log('[sync-connect] Sync complete:', syncStats);
        } catch (syncErr) {
          console.warn('[sync-connect] Sync failed (will retry on next startup):', syncErr.message);
        }
      }

      return {
        success: true,
        packageId,
        forumObjectId,
        registryId: registryId || null,
        treasuryId: treasuryId || null,
        subscriptionStoreId: subscriptionStoreId || null,
        marketplaceStoreId: marketplaceStoreId || null,
        governanceStoreId: governanceStoreId || null,
        network,
        totalEvents,
        syncStats,
        message: totalEvents > 0
          ? `Connesso e sincronizzato! Trovati ${totalEvents} eventi del forum.`
          : 'Connesso al contratto. Nessun evento ancora (forum nuovo).',
      };
    } catch (err) {
      console.error('[sync-connect] Error:', err.message);
      return {
        success: false,
        error: err.message || 'Errore di connessione alla blockchain.',
      };
    }
  },
};

function _saveToConfig(key, value) {
  try {
    let content = fs.readFileSync(CONFIG_PATH, 'utf8');
    const quoted = `'${value}'`;

    const nullPattern = new RegExp(`${key}:\\s*null`);
    if (nullPattern.test(content)) {
      content = content.replace(nullPattern, `${key}: ${quoted}`);
    } else if (content.includes(`${key}:`)) {
      const existingPattern = new RegExp(`${key}:\\s*'[^']*'`);
      content = content.replace(existingPattern, `${key}: ${quoted}`);
    } else {
      content = content.replace(/};(\s*)$/, `\n  ${key}: ${quoted},\n};$1`);
    }

    fs.writeFileSync(CONFIG_PATH, content, 'utf8');
    console.log(`[sync-connect] Saved ${key} to config`);
  } catch (e) {
    console.error(`[sync-connect] Could not save ${key}:`, e.message);
  }
}
