// Configurazione IOTA 2.0 Rebased
// Copiare questo file come private_iota_conf.js
//
// Per generare le chiavi RSA:
//   node -e "require('./api/utility/CryptHelper').RSAGenerateKeyPair().then(k => console.log(JSON.stringify(k, null, 2)))"

module.exports = {
  // ── Porte ──────────────────────────────────────────────────────
  // Backend (Sails.js)
  PORT: 1337,
  // Frontend (Vite dev server)
  FRONTEND_PORT: 5173,

  // ── Rete IOTA ─────────────────────────────────────────────────
  // 'testnet' | 'mainnet' | 'devnet'
  IOTA_NETWORK: 'testnet',

  // URL nodo custom (null = usa il default della rete selezionata)
  IOTA_NODE_URL: null,

  // Mnemonic BIP39 per il keypair Ed25519
  // Viene generato automaticamente al primo avvio se null
  IOTA_MNEMONIC: null,

  // ── Chiavi RSA ────────────────────────────────────────────────
  // Generate automaticamente al primo avvio se non presenti
  MAIN_PRIVATE_KEY: 'YOUR_RSA_PRIVATE_KEY',
  MAIN_PUBLIC_KEY: 'YOUR_RSA_PUBLIC_KEY',

  // ── Move Contract ────────────────────────────────────────────
  // Set after deploying with: node api/utility/move-publish.js
  FORUM_PACKAGE_ID: null,
  FORUM_OBJECT_ID: null,
  FORUM_REGISTRY_ID: null,
  FORUM_TREASURY_ID: null,
  FORUM_SUBSCRIPTION_STORE_ID: null,
  FORUM_MARKETPLACE_STORE_ID: null,
  FORUM_GOVERNANCE_STORE_ID: null,
  ADMIN_CAP_ID: null,

  // ── Explorer ──────────────────────────────────────────────────
  IOTA_EXPLORER_URL: 'https://explorer.rebased.iota.org',
};
