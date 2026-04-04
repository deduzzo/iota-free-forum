#!/usr/bin/env node
/**
 * full-reset.js — Complete reset: new wallet, empty DB, new contract deploy.
 *
 * Usage: node scripts/full-reset.js
 *        npm run full-reset
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../config/private_iota_conf.js');

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   🔄 IotaPolis — Full Reset              ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  WARNING: This will permanently:');
  console.log('  - Delete ALL data from the database');
  console.log('  - Generate a NEW wallet (old one lost)');
  console.log('  - Deploy a NEW smart contract');
  console.log('  - Reset ALL configuration');
  console.log('');

  // Ask for confirmation
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.question('  Are you sure? Type "yes" to confirm: ', resolve);
  });
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('\n  Aborted. Nothing was changed.\n');
    process.exit(0);
  }

  console.log('');

  // 1. Clear database
  console.log('[1/5] Clearing database...');
  const db = require('../api/utility/db');
  db.initDb();
  const database = db.getDb();
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_index_%'").all();
  for (const t of tables) {
    try { database.exec('DELETE FROM ' + t.name); } catch (e) { /* skip internal FTS tables */ }
  }
  console.log('   Database cleared (' + tables.length + ' tables)');

  // 2. Generate new wallet
  console.log('[2/5] Generating new wallet...');
  const { Ed25519Keypair } = require('@iota/iota-sdk/keypairs/ed25519');

  // Use dynamic import for ESM-only modules
  const { generateMnemonic } = await import('@scure/bip39');
  const { wordlist } = await import('@scure/bip39/wordlists/english.js');
  const mnemonic = generateMnemonic(wordlist);
  const kp = Ed25519Keypair.deriveKeypair(mnemonic);
  const address = kp.getPublicKey().toIotaAddress();
  console.log('   Address:', address);

  // 3. Update config
  console.log('[3/5] Updating config...');
  let content = fs.readFileSync(CONFIG_PATH, 'utf8');
  content = content.replace(/IOTA_MNEMONIC:\s*(?:null|'[^']*')/, `IOTA_MNEMONIC: '${mnemonic}'`);
  content = content.replace(/FORUM_PACKAGE_ID:\s*(?:null|'[^']*')/, 'FORUM_PACKAGE_ID: null');
  content = content.replace(/FORUM_OBJECT_ID:\s*(?:null|'[^']*')/, 'FORUM_OBJECT_ID: null');
  content = content.replace(/FORUM_REGISTRY_ID:\s*(?:null|'[^']*')/, 'FORUM_REGISTRY_ID: null');
  content = content.replace(/FORUM_TREASURY_ID:\s*(?:null|'[^']*')/, 'FORUM_TREASURY_ID: null');
  content = content.replace(/FORUM_SUBSCRIPTION_STORE_ID:\s*(?:null|'[^']*')/, 'FORUM_SUBSCRIPTION_STORE_ID: null');
  content = content.replace(/FORUM_MARKETPLACE_STORE_ID:\s*(?:null|'[^']*')/, 'FORUM_MARKETPLACE_STORE_ID: null');
  content = content.replace(/FORUM_GOVERNANCE_STORE_ID:\s*(?:null|'[^']*')/, 'FORUM_GOVERNANCE_STORE_ID: null');
  content = content.replace(/ADMIN_CAP_ID:\s*(?:null|'[^']*')/, 'ADMIN_CAP_ID: null');
  fs.writeFileSync(CONFIG_PATH, content, 'utf8');
  console.log('   Config reset with new mnemonic');

  // 4. Request faucet
  console.log('[4/5] Requesting faucet funds...');
  try {
    const { IotaClient, getFullnodeUrl } = require('@iota/iota-sdk/client');
    const { requestIotaFromFaucetV0, getFaucetUrl } = require('@iota/iota-sdk/faucet');
    const network = 'testnet';
    const client = new IotaClient({ url: getFullnodeUrl(network) });

    await requestIotaFromFaucetV0({ host: getFaucetUrl(network), recipient: address });
    console.log('   Faucet requested. Waiting for funds...');

    // Wait up to 30s for funds
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const balance = await client.getBalance({ owner: address });
      if (BigInt(balance.totalBalance) > 0n) {
        console.log('   Funded:', (Number(balance.totalBalance) / 1e9).toFixed(4), 'IOTA');
        break;
      }
    }
  } catch (e) {
    console.log('   Faucet warning:', e.message);
    console.log('   You may need to fund the wallet manually.');
  }

  // 5. Deploy contract
  console.log('[5/5] Deploying smart contract...');
  try {
    const { execSync } = require('child_process');
    execSync('npm run move:deploy', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  } catch (e) {
    console.log('   Deploy failed:', e.message);
    console.log('   Run "npm run move:deploy" manually after ensuring funds are available.');
    return;
  }

  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   ✅ Full Reset Complete!                ║');
  console.log('  ║                                          ║');
  console.log('  ║   Run: npm run dev                       ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
}

main().catch(err => {
  console.error('Full reset failed:', err.message);
  process.exit(1);
});
