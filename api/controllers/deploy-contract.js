/**
 * deploy-contract.js — Build and deploy the Move smart contract from the UI.
 *
 * POST /api/v1/deploy-contract
 * No auth required (only works when FORUM_PACKAGE_ID is null — first-time setup).
 * Once deployed, this endpoint is disabled.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.FORUM_DATA_DIR
  ? path.join(process.env.FORUM_DATA_DIR, 'private_iota_conf.js')
  : path.resolve(__dirname, '../../config/private_iota_conf.js');

const MOVE_DIR = path.resolve(__dirname, '../../move/forum');

module.exports = {
  friendlyName: 'Deploy Contract',
  description: 'Build and deploy the Move smart contract. Only works on first setup (no existing contract).',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
    conflict: { statusCode: 409 },
    serverError: { statusCode: 500 },
  },

  fn: async function () {
    const logs = [];
    const log = (msg) => { logs.push(msg); sails.log.info(`[deploy-contract] ${msg}`); };

    try {
      // 1. Check if already deployed
      const config = require('../../config/private_iota_conf');
      if (config.FORUM_PACKAGE_ID) {
        this.res.status(409);
        return {
          success: false,
          error: 'Contract already deployed. Use full-reset to start over.',
          packageId: config.FORUM_PACKAGE_ID,
        };
      }

      log('Starting contract deployment...');

      // 2. Build the Move contract
      log('Building Move contract...');
      try {
        const buildCmd = process.platform === 'win32'
          ? 'cd move\\forum && iota move build'
          : 'cd move/forum && iota move build';
        execSync(buildCmd, {
          cwd: path.resolve(__dirname, '../..'),
          stdio: 'pipe',
          timeout: 120000,
          env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
        });
        log('Move contract built successfully');
      } catch (buildErr) {
        const stderr = buildErr.stderr?.toString() || buildErr.message;
        log(`Build failed: ${stderr}`);
        // Check if bytecode exists anyway (might already be built)
        const buildDir = path.join(MOVE_DIR, 'build', 'IotaFreeForum', 'bytecode_modules');
        if (!fs.existsSync(buildDir)) {
          this.res.status(500);
          return { success: false, error: 'Move build failed: ' + stderr, logs };
        }
        log('Using existing build artifacts');
      }

      // 3. Load SDK and wallet
      const iota = require('../utility/iota');
      const sdk = await iota.loadSdk();
      const keypair = await iota.getKeypair();
      const client = await iota.getClient();
      const address = await iota.getAddress();
      const network = config.IOTA_NETWORK || 'testnet';

      log(`Wallet: ${address}`);

      // 4. Check balance + faucet
      const balance = await client.getBalance({ owner: address });
      const balanceNanos = BigInt(balance.totalBalance || 0);
      const MIN_BALANCE = BigInt(600_000_000);
      log(`Balance: ${Number(balanceNanos) / 1e9} IOTA`);

      if (balanceNanos < MIN_BALANCE && (network === 'testnet' || network === 'devnet')) {
        log('Low balance — requesting faucet...');
        try {
          await sdk.requestIotaFromFaucetV1({
            host: sdk.getFaucetHost(network),
            recipient: address,
          });
          const funds = await iota.waitForFunds(30000);
          log(funds.ready ? `Faucet OK: ${Number(funds.balance) / 1e9} IOTA` : 'Faucet pending, trying anyway...');
        } catch (e) {
          log('Faucet failed: ' + e.message);
        }
      }

      // 5. Read compiled bytecode
      const buildDir = path.join(MOVE_DIR, 'build', 'IotaFreeForum', 'bytecode_modules');
      if (!fs.existsSync(buildDir)) {
        this.res.status(500);
        return { success: false, error: 'Compiled bytecode not found', logs };
      }

      const moduleFiles = fs.readdirSync(buildDir).filter(f => f.endsWith('.mv'));
      if (moduleFiles.length === 0) {
        this.res.status(500);
        return { success: false, error: 'No .mv files found', logs };
      }

      log(`Found ${moduleFiles.length} module(s): ${moduleFiles.join(', ')}`);

      const moduleBytecodes = moduleFiles.map(f =>
        Array.from(fs.readFileSync(path.join(buildDir, f)))
      );

      // 6. Publish transaction
      const { Transaction } = sdk;
      const tx = new Transaction();
      const [upgradeCap] = tx.publish({
        modules: moduleBytecodes,
        dependencies: ['0x1', '0x2'],
      });
      tx.transferObjects([upgradeCap], address);
      tx.setGasBudget(200_000_000);

      log('Publishing to blockchain...');

      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true, showObjectChanges: true },
      });

      if (result.effects?.status?.status !== 'success') {
        const errMsg = result.effects?.status?.error || 'Transaction failed';
        log(`Publish failed: ${errMsg}`);
        this.res.status(500);
        return { success: false, error: errMsg, logs };
      }

      log(`TX digest: ${result.digest}`);

      // 7. Extract IDs — 5 shared objects + AdminCap
      let packageId = null;
      let forumObjectId = null;
      let registryId = null;
      let treasuryId = null;
      let subscriptionStoreId = null;
      let marketplaceStoreId = null;
      let adminCapId = null;

      for (const change of (result.objectChanges || [])) {
        if (change.type === 'published') packageId = change.packageId;
        if (change.type === 'created') {
          if (change.objectType?.includes('::forum::Forum') && !change.objectType?.includes('::forum::ForumEvent')) {
            forumObjectId = change.objectId;
          }
          if (change.objectType?.includes('::forum::UserRegistry')) registryId = change.objectId;
          if (change.objectType?.includes('::forum::Treasury')) treasuryId = change.objectId;
          if (change.objectType?.includes('::forum::SubscriptionStore')) subscriptionStoreId = change.objectId;
          if (change.objectType?.includes('::forum::MarketplaceStore')) marketplaceStoreId = change.objectId;
          if (change.objectType?.includes('::forum::AdminCap')) adminCapId = change.objectId;
        }
      }

      if (!packageId || !forumObjectId || !registryId) {
        log('Could not extract IDs from transaction');
        this.res.status(500);
        return { success: false, error: 'Deploy succeeded but could not extract IDs', logs, digest: result.digest };
      }

      log(`Package ID: ${packageId}`);
      log(`Forum Object: ${forumObjectId}`);
      log(`Registry: ${registryId}`);
      log(`Treasury: ${treasuryId || 'N/A'}`);
      log(`SubscriptionStore: ${subscriptionStoreId || 'N/A'}`);
      log(`MarketplaceStore: ${marketplaceStoreId || 'N/A'}`);
      log(`Admin Cap: ${adminCapId || 'N/A'}`);

      // 8. Save to config
      _saveToConfig('FORUM_PACKAGE_ID', packageId);
      _saveToConfig('FORUM_OBJECT_ID', forumObjectId);
      _saveToConfig('FORUM_REGISTRY_ID', registryId);
      if (treasuryId) _saveToConfig('FORUM_TREASURY_ID', treasuryId);
      if (subscriptionStoreId) _saveToConfig('FORUM_SUBSCRIPTION_STORE_ID', subscriptionStoreId);
      if (marketplaceStoreId) _saveToConfig('FORUM_MARKETPLACE_STORE_ID', marketplaceStoreId);
      if (adminCapId) _saveToConfig('ADMIN_CAP_ID', adminCapId);

      // Update in-memory config
      config.FORUM_PACKAGE_ID = packageId;
      config.FORUM_OBJECT_ID = forumObjectId;
      config.FORUM_REGISTRY_ID = registryId;
      if (treasuryId) config.FORUM_TREASURY_ID = treasuryId;
      if (subscriptionStoreId) config.FORUM_SUBSCRIPTION_STORE_ID = subscriptionStoreId;
      if (marketplaceStoreId) config.FORUM_MARKETPLACE_STORE_ID = marketplaceStoreId;
      if (adminCapId) config.ADMIN_CAP_ID = adminCapId;

      const connectionString = `${network}:${packageId}:${forumObjectId}:${registryId}:${treasuryId || ''}:${subscriptionStoreId || ''}:${marketplaceStoreId || ''}`;
      log(`Deployed! Connection: ${connectionString}`);

      // Broadcast
      try {
        await sails.helpers.broadcastEvent('dataChanged', {
          entity: 'config',
          action: 'contractDeployed',
          label: connectionString,
        });
      } catch (e) { /* best effort */ }

      return {
        success: true,
        packageId,
        forumObjectId,
        registryId,
        treasuryId,
        subscriptionStoreId,
        marketplaceStoreId,
        adminCapId,
        connectionString,
        digest: result.digest,
        logs,
      };
    } catch (err) {
      log(`Fatal error: ${err.message}`);
      sails.log.error('[deploy-contract]', err);
      this.res.status(500);
      return { success: false, error: err.message, logs };
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
    } else {
      const existingPattern = new RegExp(`${key}:\\s*'[^']*'`);
      if (existingPattern.test(content)) {
        content = content.replace(existingPattern, `${key}: ${quoted}`);
      } else {
        content = content.replace('};', `  ${key}: ${quoted},\n};`);
      }
    }
    fs.writeFileSync(CONFIG_PATH, content, 'utf8');
    console.log(`[deploy-contract] Saved ${key} to config`);
  } catch (e) {
    console.error(`[deploy-contract] Could not save ${key}:`, e.message);
  }
}
