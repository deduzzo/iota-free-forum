/**
 * faucet-request.js — Send gas IOTA to a new user's address.
 *
 * POST /api/v1/faucet-request
 * Body: { address: "0x..." }
 *
 * No authentication needed (anyone can request gas for a new wallet).
 * Rate limited: 1 request per address, max 1 IOTA per request.
 * Backend sends gas from its own wallet to the requested address.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'Faucet Request',
  description: 'Send gas IOTA to a new user address. Rate limited to 1 per address.',

  inputs: {
    address: { type: 'string', required: true },
  },

  exits: {
    success: { statusCode: 200 },
    badRequest: { statusCode: 400 },
    tooManyRequests: { statusCode: 429 },
    serverError: { statusCode: 500 },
  },

  fn: async function (inputs) {
    try {
      const address = inputs.address.trim();

      // Validate address format (IOTA addresses start with 0x)
      if (!address || !address.startsWith('0x') || address.length < 10) {
        this.res.status(400);
        return { success: false, error: 'Invalid IOTA address format. Must start with 0x.' };
      }

      // Rate limit 1: per-address (prevent re-funding)
      const Wallets = db.getModel('wallets');
      const existing = Wallets.findOne({ address });
      if (existing && existing.funded) {
        this.res.status(429);
        return { success: false, error: 'Address already funded. Only one faucet request per address.' };
      }

      // Rate limit 2: global cooldown (prevent address-generation spam)
      // Max 1 faucet disbursement every 10 seconds server-wide
      const database = db.getDb();
      try {
        const lastFaucet = database.prepare(
          'SELECT MAX(fundedAt) as lastAt FROM wallets WHERE funded = 1'
        ).get();
        if (lastFaucet?.lastAt && (Date.now() - lastFaucet.lastAt) < 10000) {
          this.res.status(429);
          return { success: false, error: 'Faucet rate limit: please wait before requesting again.' };
        }
      } catch (e) { /* wallets table may be empty */ }

      // Rate limit 3: per-IP (prevent single attacker generating many addresses)
      // Use only req.ip (trusted by Express/Sails trust proxy setting)
      // Do NOT use x-forwarded-for directly — it can be spoofed by clients
      const clientIp = this.req.ip || 'unknown';
      try {
        const recentFromIp = database.prepare(
          'SELECT COUNT(*) as cnt FROM wallets WHERE funded = 1 AND fundedAt > ? AND userId = ?'
        ).get(Date.now() - 3600000, clientIp); // reuse userId field to track IP temporarily
        if (recentFromIp?.cnt >= 5) {
          this.res.status(429);
          return { success: false, error: 'Too many faucet requests from this IP. Max 5 per hour.' };
        }
      } catch (e) { /* best effort */ }

      // Send gas from backend wallet
      const iota = require('../utility/iota');
      const sdk = await iota.loadSdk();
      const client = await iota.getClient();
      const keypair = await iota.getKeypair();

      // Amount: 1 IOTA = 1,000,000,000 nanos
      const FAUCET_AMOUNT = 1000000000n; // 1 IOTA

      const tx = new sdk.Transaction();
      const [coin] = tx.splitCoins(tx.gas, [FAUCET_AMOUNT]);
      tx.transferObjects([coin], address);
      tx.setGasBudget(50000000);

      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });

      // Wait for confirmation
      await client.waitForTransaction({ digest: result.digest });

      const txStatus = result.effects?.status?.status;
      if (txStatus !== 'success') {
        sails.log.error(`[faucet-request] TX failed for ${address}: ${txStatus}`);
        this.res.status(500);
        return { success: false, error: 'Transaction failed: ' + (txStatus || 'unknown') };
      }

      // Record in wallets table
      const now = Date.now();
      if (existing) {
        // Update existing record
        const database = db.getDb();
        database.prepare('UPDATE wallets SET funded = 1, fundedAt = ? WHERE address = ?').run(now, address);
      } else {
        Wallets.create({
          address,
          userId: clientIp, // Track IP for rate limiting; overwritten when user registers on-chain
          funded: 1,
          fundedAt: now,
        });
      }

      sails.log.info(`[faucet-request] Funded ${address} with 1 IOTA. Digest: ${result.digest}`);

      return {
        success: true,
        address,
        amount: '1000000000',
        digest: result.digest,
      };
    } catch (err) {
      sails.log.error('[faucet-request] Error:', err.message);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
