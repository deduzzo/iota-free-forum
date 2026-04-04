/**
 * api-forum-info.js — Public info about this forum instance
 * Returns the wallet address and network so others can connect.
 */
module.exports = {
  friendlyName: 'Forum Info',
  description: 'Get public info about this forum instance (address, network, name).',

  inputs: {},
  exits: { success: { statusCode: 200 } },

  fn: async function () {
    try {
      const iota = require('../utility/iota');
      const db = require('../utility/db');

      let address = null;
      let network = null;
      let explorerUrl = null;
      let packageId = null;
      let forumObjectId = null;
      let registryId = null;
      let treasuryId = null;
      let subscriptionStoreId = null;
      let marketplaceStoreId = null;
      let governanceStoreId = null;
      let moveMode = false;

      try {
        address = await iota.getAddress();
        const config = require('../../config/private_iota_conf');
        network = config.IOTA_NETWORK || 'testnet';
        explorerUrl = config.IOTA_EXPLORER_URL || null;
        packageId = config.FORUM_PACKAGE_ID || null;
        forumObjectId = config.FORUM_OBJECT_ID || null;
        registryId = config.FORUM_REGISTRY_ID || null;
        treasuryId = config.FORUM_TREASURY_ID || null;
        subscriptionStoreId = config.FORUM_SUBSCRIPTION_STORE_ID || null;
        marketplaceStoreId = config.FORUM_MARKETPLACE_STORE_ID || null;
        governanceStoreId = config.FORUM_GOVERNANCE_STORE_ID || null;
        moveMode = iota.isMoveModeEnabled();
      } catch (e) {
        console.log('[api-forum-info] Could not get wallet info:', e.message);
      }

      // Forum name from theme config
      let forumName = 'IotaPolis';
      try {
        const Config = db.getModel('config');
        const themeConfig = Config.findOne({ id: 'CONFIG_theme' });
        if (themeConfig && themeConfig.overrides) {
          const overrides = JSON.parse(themeConfig.overrides);
          if (overrides.forumName) forumName = overrides.forumName;
        }
      } catch (e) { /* ignore */ }

      // Connection string: 7-segment format with all shared objects
      // Format: network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId
      // Falls back to 3-segment (legacy) if new IDs not yet configured
      let connectionString = null;
      if (moveMode && packageId && forumObjectId && registryId && treasuryId && subscriptionStoreId && marketplaceStoreId) {
        connectionString = governanceStoreId
          ? `${network}:${packageId}:${forumObjectId}:${registryId}:${treasuryId}:${subscriptionStoreId}:${marketplaceStoreId}:${governanceStoreId}`
          : `${network}:${packageId}:${forumObjectId}:${registryId}:${treasuryId}:${subscriptionStoreId}:${marketplaceStoreId}`;
      } else if (moveMode && packageId && forumObjectId) {
        // Legacy 3-segment format (backward compat)
        connectionString = `${network}:${packageId}:${forumObjectId}`;
      } else if (address) {
        connectionString = `${network}:${address}`;
      }

      return {
        success: true,
        forumName,
        address,
        network,
        explorerUrl,
        packageId,
        forumObjectId,
        registryId,
        treasuryId,
        subscriptionStoreId,
        marketplaceStoreId,
        governanceStoreId,
        moveMode,
        version: '0.2.0',
        connectionString,
      };
    } catch (err) {
      this.res.status(500);
      return { success: false, error: err.message };
    }
  },
};
