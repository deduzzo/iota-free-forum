/**
 * IOTA 2.0 Rebased - Utility per blockchain
 *
 * Usa @iota/iota-sdk con dynamic import per compatibilita CommonJS.
 * Keypair singolo Ed25519 derivato da mnemonic BIP39.
 * I dati vengono pubblicati come transazioni con metadata e
 * memorizzati nella cache locale (modello BlockchainData).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CONFIG_PATH = process.env.FORUM_DATA_DIR
  ? path.join(process.env.FORUM_DATA_DIR, 'private_iota_conf.js')
  : path.resolve(__dirname, '../../config/private_iota_conf.js');

// Lazy-loaded SDK modules
let _sdk = null;
let _keypair = null;
let _client = null;
let _address = null;
let _socketId = undefined;

// Lock sequenziale per TX: IOTA non permette TX parallele dallo stesso wallet
let _txQueue = Promise.resolve();
function _enqueueTx(fn) {
  _txQueue = _txQueue.then(fn, fn);
  return _txQueue;
}

// Config - caricata on-demand per evitare crash se il file non esiste
let _config = null;
function _getConfig() {
  if (!_config) {
    try {
      _config = require('../../config/private_iota_conf');
    } catch (e) {
      // Config non presente - ritorna defaults
      _config = {
        IOTA_NETWORK: 'testnet',
        IOTA_NODE_URL: null,
        IOTA_MNEMONIC: null,
        MAIN_PRIVATE_KEY: null,
        MAIN_PUBLIC_KEY: null,
        IOTA_EXPLORER_URL: 'https://explorer.rebased.iota.org',
      };
    }
  }
  return _config;
}

const GET_MAIN_KEYS = () => {
  const config = _getConfig();
  return { privateKey: config.MAIN_PRIVATE_KEY, publicKey: config.MAIN_PUBLIC_KEY };
};

// Tag prefix per identificare le nostre transazioni
const APP_TAG = 'iotaforum';

// Prefisso entityId per assistiti (compatibilita con Assistito.getWalletIdAssistito)
const ASSISTITO_ACCOUNT_PREFIX = 'ASS#';

/**
 * Carica i moduli ESM dell'SDK via dynamic import (una sola volta)
 */
async function loadSdk() {
  if (_sdk) return _sdk;
  const [clientMod, txMod, keypairMod, faucetMod, utilsMod] = await Promise.all([
    import('@iota/iota-sdk/client'),
    import('@iota/iota-sdk/transactions'),
    import('@iota/iota-sdk/keypairs/ed25519'),
    import('@iota/iota-sdk/faucet'),
    import('@iota/iota-sdk/utils'),
  ]);
  _sdk = {
    getFullnodeUrl: clientMod.getFullnodeUrl,
    IotaClient: clientMod.IotaClient,
    Transaction: txMod.Transaction,
    Ed25519Keypair: keypairMod.Ed25519Keypair,
    getFaucetHost: faucetMod.getFaucetHost,
    requestIotaFromFaucetV1: faucetMod.requestIotaFromFaucetV1,
    NANOS_PER_IOTA: utilsMod.NANOS_PER_IOTA,
  };
  return _sdk;
}

/**
 * Ottieni il client IOTA
 */
async function getClient() {
  if (_client) return _client;
  const sdk = await loadSdk();
  const config = _getConfig();
  const url = config.IOTA_NODE_URL || sdk.getFullnodeUrl(config.IOTA_NETWORK || 'testnet');
  _client = new sdk.IotaClient({ url });
  return _client;
}

/**
 * Ottieni il keypair dal mnemonic
 */
async function getKeypair() {
  if (_keypair) return _keypair;
  const config = _getConfig();
  if (!config.IOTA_MNEMONIC) {
    throw new Error('Wallet non inizializzato. Mnemonic non presente nella configurazione.');
  }
  const sdk = await loadSdk();
  _keypair = sdk.Ed25519Keypair.deriveKeypair(config.IOTA_MNEMONIC);
  _address = _keypair.getPublicKey().toIotaAddress();
  return _keypair;
}

/**
 * Ottieni l'indirizzo del wallet
 */
async function getAddress() {
  await getKeypair();
  return _address;
}

// --- Utility ---

let setSocketId = (socketId) => {
  if (socketId !== null) _socketId = socketId;
};

let stringToHex = (text) => {
  return '0x' + Buffer.from(text).toString('hex');
};

let hexToString = (hex) => {
  return Buffer.from(hex.replace('0x', ''), 'hex').toString();
};

let showBalanceFormatted = (balanceNanos) => {
  const nanos = BigInt(balanceNanos || 0);
  const iotaVal = nanos / BigInt(1000000000);
  const formatted = nanos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted} nanos [${iotaVal} IOTA]`;
};

// --- Inizializzazione ---

async function isWalletInitialized() {
  try {
    const config = _getConfig();
    if (!config.IOTA_MNEMONIC) return false;
    await getKeypair();
    await getClient();
    return true;
  } catch (ex) {
    return false;
  }
}

async function getOrInitWallet() {
  const sdk = await loadSdk();
  const config = _getConfig();

  if (config.IOTA_MNEMONIC) {
    // Gia inizializzato
    const kp = await getKeypair();
    const address = kp.getPublicKey().toIotaAddress();
    return { init: false, mnemonic: null, address };
  }

  // Genera nuovo mnemonic
  const { generateMnemonic } = await import('@scure/bip39');
  const { wordlist } = await import('@scure/bip39/wordlists/english.js');
  const mnemonic = generateMnemonic(wordlist);

  const kp = sdk.Ed25519Keypair.deriveKeypair(mnemonic);
  const address = kp.getPublicKey().toIotaAddress();

  // Salva mnemonic nel file di configurazione
  _saveMnemonicToConfig(mnemonic);

  // Aggiorna runtime
  config.IOTA_MNEMONIC = mnemonic;
  _keypair = kp;
  _address = address;

  // Richiedi fondi dal faucet (testnet/devnet)
  const network = config.IOTA_NETWORK || 'testnet';
  if (network === 'testnet' || network === 'devnet') {
    try {
      await sdk.requestIotaFromFaucetV1({
        host: sdk.getFaucetHost(network),
        recipient: address,
      });
      if (typeof sails !== 'undefined') {
        sails.helpers.consoleSocket('Faucet: fondi richiesti per ' + address, _socketId);
      }
    } catch (e) {
      if (typeof sails !== 'undefined') {
        sails.log.warn('Faucet request failed:', e.message);
      }
    }
  }

  // Wait for faucet funds to arrive
  console.log(`[iota] Wallet created: ${address}. Waiting for faucet funds...`);
  const fundsResult = await waitForFunds(30000);
  if (fundsResult.ready) {
    console.log(`[iota] Wallet funded: ${fundsResult.coins} coins, ${fundsResult.balance} nanos`);
  } else {
    console.log('[iota] WARNING: Faucet funds not yet available');
  }

  return { init: true, mnemonic, address, funded: fundsResult.ready };
}

function _saveMnemonicToConfig(mnemonic) {
  try {
    let content = fs.readFileSync(CONFIG_PATH, 'utf8');
    content = content.replace(
      /IOTA_MNEMONIC:\s*null/,
      `IOTA_MNEMONIC: '${mnemonic}'`
    );
    fs.writeFileSync(CONFIG_PATH, content, 'utf8');
  } catch (e) {
    console.error('Could not save mnemonic to config file:', e.message);
  }
}

// --- Status ---

async function getStatusAndBalance() {
  if (!await isWalletInitialized()) {
    return { status: 'WALLET non inizializzato', balance: '0', address: null };
  }
  try {
    const client = await getClient();
    const address = await getAddress();
    const balance = await client.getBalance({ owner: address });
    return {
      status: 'WALLET OK',
      balance: showBalanceFormatted(balance.totalBalance),
      address: address,
      network: _getConfig().IOTA_NETWORK || 'testnet',
      explorerUrl: _getConfig().IOTA_EXPLORER_URL,
    };
  } catch (err) {
    return {
      status: 'Errore connessione',
      balance: '0',
      address: _address,
      error: err.message,
    };
  }
}

/**
 * Wait until the wallet has gas coins available.
 * Polls every 2 seconds for up to maxWaitMs.
 * On testnet/devnet, requests faucet if balance is 0.
 */
async function waitForFunds(maxWaitMs = 30000) {
  const config = _getConfig();
  const network = config.IOTA_NETWORK || 'testnet';
  const isTestnet = network === 'testnet' || network === 'devnet';
  const start = Date.now();

  console.log(`[iota] Waiting for gas coins... (max ${maxWaitMs / 1000}s)`);

  while (Date.now() - start < maxWaitMs) {
    try {
      const client = await getClient();
      const address = await getAddress();
      const coins = await client.getCoins({ owner: address });

      if (coins.data && coins.data.length > 0) {
        const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
        console.log(`[iota] Gas coins available: ${coins.data.length} coins, ${totalBalance} nanos`);
        return { ready: true, coins: coins.data.length, balance: totalBalance.toString() };
      }

      // No coins — request faucet on testnet
      if (isTestnet && Date.now() - start < maxWaitMs / 2) {
        try {
          const sdk = await loadSdk();
          await sdk.requestIotaFromFaucetV1({
            host: sdk.getFaucetHost(network),
            recipient: address,
          });
          console.log('[iota] Faucet requested while waiting for funds');
        } catch (e) { /* faucet may be rate-limited */ }
      }
    } catch (e) {
      console.log('[iota] waitForFunds check error:', e.message);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('[iota] waitForFunds: timeout — no gas coins after', maxWaitMs / 1000, 'seconds');
  return { ready: false };
}

/**
 * Merge all IOTA coins into a single coin to avoid fragmentation.
 * After splitCoins TXs, the wallet may have hundreds of micro-coins.
 */
/**
 * Merge all IOTA coins into a single coin to avoid fragmentation.
 * Uses pagination to find all coins and selects the largest as gas.
 * Merges in batches of 256 (IOTA limit per mergeCoins command).
 */
async function _mergeAllCoins() {
  try {
    const sdk = await loadSdk();
    const client = await getClient();
    const keypair = await getKeypair();
    const address = await getAddress();

    // Fetch ALL coins with pagination
    let allCoins = [];
    let cursor = null;
    let hasMore = true;
    while (hasMore) {
      const batch = await client.getCoins({ owner: address, cursor });
      allCoins = allCoins.concat(batch.data);
      hasMore = batch.hasNextPage;
      cursor = batch.nextCursor;
    }

    if (allCoins.length <= 1) return;

    console.log(`[iota] Merging ${allCoins.length} coins into one...`);

    // Sort by balance descending — use largest as gas
    allCoins.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
    const gasCoin = allCoins[0];
    const others = allCoins.slice(1);

    // Merge in batches of 256 (IOTA limits mergeCoins arguments)
    const MERGE_BATCH = 256;
    for (let i = 0; i < others.length; i += MERGE_BATCH) {
      const batch = others.slice(i, i + MERGE_BATCH);
      const tx = new sdk.Transaction();
      tx.setGasPayment([{ objectId: gasCoin.coinObjectId, version: gasCoin.version, digest: gasCoin.digest }]);
      tx.mergeCoins(tx.gas, batch.map(c => tx.object(c.coinObjectId)));
      tx.setGasBudget(50000000);

      const result = await client.signAndExecuteTransaction({
        signer: keypair, transaction: tx, options: { showEffects: true },
      });
      await client.waitForTransaction({ digest: result.digest });
      console.log(`[iota] Merge batch ${Math.floor(i / MERGE_BATCH) + 1}: merged ${batch.length} coins`);

      // Re-fetch the merged coin for next batch (version/digest changed)
      if (i + MERGE_BATCH < others.length) {
        await new Promise(r => setTimeout(r, 500));
        // Fetch all coins and find the largest
        let refreshedCoins = [];
        let refCursor = null;
        let refMore = true;
        while (refMore) {
          const refBatch = await client.getCoins({ owner: address, cursor: refCursor });
          refreshedCoins = refreshedCoins.concat(refBatch.data);
          refMore = refBatch.hasNextPage;
          refCursor = refBatch.nextCursor;
        }
        if (refreshedCoins.length > 0) {
          refreshedCoins.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
          const largest = refreshedCoins[0];
          gasCoin.coinObjectId = largest.coinObjectId;
          gasCoin.version = largest.version;
          gasCoin.digest = largest.digest;
          // Update others list to only include coins not yet merged
          const mergedIds = new Set(others.slice(0, i + MERGE_BATCH).map(c => c.coinObjectId));
          const remaining = refreshedCoins.filter(c => c.coinObjectId !== gasCoin.coinObjectId && !mergedIds.has(c.coinObjectId));
          // Replace remaining batches
          others.splice(i + MERGE_BATCH, others.length, ...remaining);
        }
      }
    }

    await new Promise(r => setTimeout(r, 1000));
    const after = await client.getCoins({ owner: address });
    console.log(`[iota] Merge complete: ${after.data.length} coins remaining`);
  } catch (e) {
    console.log('[iota] Merge coins failed (non-fatal):', e.message);
  }
}

// --- Pubblicazione dati ---

// --- Encoding/Decoding payload in transazioni ---
// I dati vengono codificati come u64 split-coin amounts nella transazione.
// Ogni chunk: 1 byte indice + 7 bytes dati = 8 bytes = 1 u64
// Il primo split ha amount = 1 (marker), il secondo = lunghezza payload.
// I successivi contengono i chunks del payload codificati.

// --- V3 Encoding: 2 bytes per coin (half the coins of V2, affordable) ---
// Each pair of bytes is encoded as: (chunkIndex * 65536) + (byte0 * 256) + byte1
// Max value per coin: ~19M nanos (~0.019 IOTA) at max index
// For 580 bytes: 290 coins, total ~2.8 IOTA — fits in a single TX under 512 limit
//
// Marker: 2 = v2/v3 encoding (distinguished by payload structure)
const ENCODING_VERSION = 2;

function _encodePayloadToChunks(payload) {
  const payloadBytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const chunks = [];
  for (let i = 0; i < payloadBytes.length; i += 2) {
    const chunkIdx = Math.floor(i / 2);
    const b0 = payloadBytes[i];
    const b1 = i + 1 < payloadBytes.length ? payloadBytes[i + 1] : 0;
    // value = chunkIndex * 65536 + byte0 * 256 + byte1
    const value = BigInt(chunkIdx) * 65536n + BigInt(b0) * 256n + BigInt(b1);
    chunks.push(value);
  }
  return { chunks, length: payloadBytes.length };
}

function _decodeChunksToBuffer(u64Values, payloadLength) {
  const result = Buffer.alloc(payloadLength);

  for (const val of u64Values) {
    const v = BigInt(val);
    const chunkIdx = Number(v / 65536n);
    const remainder = Number(v % 65536n);
    const b0 = (remainder >> 8) & 0xFF;
    const b1 = remainder & 0xFF;
    const offset = chunkIdx * 2;
    if (offset < payloadLength) result[offset] = b0;
    if (offset + 1 < payloadLength) result[offset + 1] = b1;
  }
  return result;
}

/**
 * Pubblica dati cifrati sulla blockchain IOTA 2.0.
 * Il payload viene codificato interamente negli amounts delle split-coin
 * della transazione. ZERO database locale - tutto on-chain.
 *
 * Struttura transazione:
 *  - split[0] amount=1 (marker exart26)
 *  - split[1] amount=payloadLength
 *  - split[2..N] amount=chunk (7 bytes dati + 1 byte indice)
 *  - Tutti trasferiti a se stessi
 *
 * @param {string} tag - Tipo di dato (es. 'MAIN_DATA', 'ORGANIZZAZIONE_DATA')
 * @param {object} dataObject - Payload (gia cifrato da CryptHelper)
 * @param {string|null} entityId - ID entita opzionale
 * @param {number|null} version - Versione del dato
 * @returns {object} { success, digest, error }
 */
// Contatore TX pending per monitoraggio
let _pendingTxCount = 0;

async function publishData(tag, dataObject, entityId = null, version = null) {
  // Pre-flight: ensure wallet has funds and coins are merged
  try {
    const client = await getClient();
    const address = await getAddress();

    // Fetch all coins to check state
    let allCoins = [];
    let cursor = null;
    let hasMore = true;
    while (hasMore) {
      const batch = await client.getCoins({ owner: address, cursor });
      allCoins = allCoins.concat(batch.data);
      hasMore = batch.hasNextPage;
      cursor = batch.nextCursor;
    }

    const totalBalance = allCoins.reduce((s, c) => s + BigInt(c.balance), 0n);
    const minRequired = 500000000n; // 0.5 IOTA minimum to publish

    if (totalBalance < minRequired) {
      const config = _getConfig();
      const network = config.IOTA_NETWORK || 'testnet';
      if (network === 'testnet' || network === 'devnet') {
        console.log(`[iota] Balance too low (${totalBalance} nanos). Requesting faucet in loop...`);
        // Request faucet multiple times until we have enough
        for (let attempt = 0; attempt < 5; attempt++) {
          try { await requestFaucet(); } catch (e) { /* rate limited */ }
          await new Promise(r => setTimeout(r, 3000));
          const funds = await waitForFunds(10000);
          if (funds.ready) {
            // Re-check balance
            const bal = await client.getBalance({ owner: address });
            if (BigInt(bal.totalBalance) >= minRequired) {
              console.log(`[iota] Funded: ${bal.totalBalance} nanos after ${attempt + 1} faucet requests`);
              break;
            }
          }
        }
      } else {
        return { success: false, digest: null, error: `Insufficient balance: ${totalBalance} nanos. Minimum required: ${minRequired}. Please fund the wallet.` };
      }
    }

    // Merge coins if too fragmented (>5 coins)
    if (allCoins.length > 5) {
      console.log(`[iota] Wallet fragmented (${allCoins.length} coins). Merging before publish...`);
      await _mergeAllCoins();
    }
  } catch (e) {
    console.log('[iota] Pre-flight check failed (non-fatal):', e.message);
  }

  // Serializza le TX: IOTA non permette TX parallele dallo stesso wallet
  _pendingTxCount++;
  try {
    const result = await _enqueueTx(() => _publishDataWithRetry(tag, dataObject, entityId, version));
    return result;
  } finally {
    _pendingTxCount--;
  }
}

function getPendingTxCount() { return _pendingTxCount; }

async function _publishDataWithRetry(tag, dataObject, entityId = null, version = null, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await _publishDataImpl(tag, dataObject, entityId, version);
    if (result.success) return result;

    // Se e un errore di equivocation/conflict, aspetta e riprova
    const retryable = result.error && (
      result.error.includes('equivocation') ||
      result.error.includes('ObjectVersionUnavailableForConsumption') ||
      result.error.includes('Could not find the referenced object')
    );

    if (retryable && attempt < maxRetries) {
      const wait = attempt * 2000;
      sails.log.warn(`[iota] publishData retry ${attempt}/${maxRetries} per ${tag}:${entityId} tra ${wait}ms (${result.error.substring(0, 80)})`);
      await new Promise(r => setTimeout(r, wait));
    } else {
      if (attempt > 1) sails.log.warn(`[iota] publishData FALLITA dopo ${attempt} tentativi per ${tag}:${entityId}`);
      return result;
    }
  }
}

// V3 encoding: 2 bytes per coin → 500 coins = 1000 bytes per TX
// With marker + length overhead, safe limit = 996 bytes per TX
const MAX_CHUNKS_PER_TX = 498;
// Max payload compresso per singola TX (chain-linking if larger)
const MAX_PART_BYTES = MAX_CHUNKS_PER_TX * 2; // 996 bytes

/**
 * Pubblica una singola TX on-chain (senza chain-linking).
 * Usata internamente sia per TX normali che per parti di una chain.
 */
async function _publishSingleTx(marker, payloadBuf) {
  const sdk = await loadSdk();
  const client = await getClient();
  const keypair = await getKeypair();
  const address = await getAddress();
  const config = _getConfig();

  const { chunks, length: payloadLength } = _encodePayloadToChunks(payloadBuf);

  const tx = new sdk.Transaction();

  // All amounts: marker + payload length + data chunks
  const allAmounts = [BigInt(marker), BigInt(payloadLength), ...chunks];

  // IOTA 2.0 limit: max 512 arguments per command
  // Split into batches of 500 to stay under the limit
  const BATCH_SIZE = 500;
  const allCoins = [];
  for (let i = 0; i < allAmounts.length; i += BATCH_SIZE) {
    const batch = allAmounts.slice(i, i + BATCH_SIZE);
    const batchCoins = tx.splitCoins(tx.gas, batch.map(a => tx.pure.u64(a)));
    for (let j = 0; j < batch.length; j++) {
      allCoins.push(batchCoins[j]);
    }
  }

  // Transfer each split coin to self
  for (let i = 0; i < allCoins.length; i++) {
    tx.transferObjects([allCoins[i]], tx.pure.address(address));
  }

  // Gas budget: enough for split+transfer commands without over-reserving
  // Each split+transfer pair uses ~500K-1M gas. Use 1M per coin + 50M base.
  tx.setGasBudget(Math.max(50000000, allCoins.length * 1000000));

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showInput: true, showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  // Check if TX was successful on-chain
  const txStatus = result.effects?.status?.status;
  if (txStatus !== 'success') {
    const errMsg = result.effects?.status?.error || `TX on-chain status: ${txStatus}`;
    console.log(`[iota] _publishSingleTx FAILED on-chain: ${errMsg}`);
    throw new Error(errMsg);
  }

  const network = config.IOTA_NETWORK || 'testnet';
  const explorerUrl = `https://explorer.iota.org/txblock/${result.digest}${network !== 'mainnet' ? '?network=' + network : ''}`;
  if (typeof sails !== 'undefined') {
    try { sails.helpers.consoleSocket(`TX: ${explorerUrl}`, _socketId); } catch (e) { /* */ }
  }

  return { digest: result.digest, explorerUrl, chunks: chunks.length, bytes: payloadLength };
}

async function _publishDataImpl(tag, dataObject, entityId = null, version = null) {
  try {
    const payloadJson = JSON.stringify({
      app: APP_TAG,
      tag: tag,
      entityId: entityId,
      version: version,
      data: dataObject,
      timestamp: Date.now(),
    });

    // Comprimi con gzip
    const compressedBuf = zlib.gzipSync(payloadJson);
    const compressionRatio = ((1 - compressedBuf.length / payloadJson.length) * 100).toFixed(0);

    // Se entra in una singola TX → pubblica direttamente
    if (compressedBuf.length <= MAX_PART_BYTES) {
      sails.log.info(`[iota] publishData: tag=${tag} entityId=${entityId} json=${payloadJson.length}B gz=${compressedBuf.length}B (-${compressionRatio}%)`);
      const result = await _publishSingleTx(2, compressedBuf);
      sails.log.info(`[iota] publishData OK: ${result.digest} (${result.chunks} chunks)`);
      return { success: true, digest: result.digest, explorerUrl: result.explorerUrl, error: null };
    }

    // Chain-linking: payload troppo grande, divide in parti collegate con prev
    sails.log.info(`[iota] publishData CHAIN: tag=${tag} entityId=${entityId} gz=${compressedBuf.length}B supera ${MAX_PART_BYTES}B, splitting...`);

    // Dividi il buffer compresso in parti
    const parts = [];
    for (let i = 0; i < compressedBuf.length; i += MAX_PART_BYTES) {
      parts.push(compressedBuf.subarray(i, i + MAX_PART_BYTES));
    }

    sails.log.info(`[iota] publishData CHAIN: ${parts.length} parti da pubblicare`);

    // Pubblica ogni parte come TX separata
    // Ogni parte e un JSON wrapper: {app, _chain: {part, total, prev?}, _data: base64(bytes)}
    let prevDigest = null;
    let lastResult = null;

    for (let i = 0; i < parts.length; i++) {
      // Merge all coins back into one before each chain part (avoid fragmentation)
      if (i > 0) {
        await _mergeAllCoins();
      }
      const partWrapper = JSON.stringify({
        app: APP_TAG,
        _chain: {
          tag: tag,
          entityId: entityId,
          version: version,
          part: i,
          total: parts.length,
          prev: prevDigest,
        },
        _data: parts[i].toString('base64'),
        timestamp: Date.now(),
      });

      // Le parti wrapper sono piccole (base64 di ~2.8KB = ~3.7KB + overhead < 5KB)
      const partBuf = zlib.gzipSync(partWrapper);
      const result = await _publishSingleTx(2, partBuf);
      sails.log.info(`[iota] publishData CHAIN part ${i+1}/${parts.length}: ${result.digest} (${result.chunks} chunks)`);
      prevDigest = result.digest;
      lastResult = result;
    }

    sails.log.info(`[iota] publishData CHAIN OK: ${parts.length} parti, ultimo digest=${lastResult.digest}`);
    return { success: true, digest: lastResult.digest, explorerUrl: lastResult.explorerUrl, error: null, chainParts: parts.length };
  } catch (e) {
    console.error('[iota] publishData error:', e.message || e);
    return { success: false, digest: null, error: e.message || String(e) };
  }
}

// --- Lettura dati dalla blockchain ---

/**
 * Decodifica il payload da una transazione IOTA 2.0.
 * Legge gli input u64 della transazione e ricostruisce il JSON.
 */
// Markers: 1 = legacy (JSON non compresso), 2 = gzip compresso
const MARKER_LEGACY = BigInt(1);
const MARKER_GZIP = BigInt(2);

function _decodeTransactionPayload(txDetail) {
  try {
    const inputs = txDetail.transaction?.data?.transaction?.inputs || [];
    const u64Inputs = inputs.filter(i => i.valueType === 'u64').map(i => BigInt(i.value));

    if (u64Inputs.length < 3) return null;
    const marker = u64Inputs[0];
    if (marker !== MARKER_LEGACY && marker !== MARKER_GZIP) return null;

    const payloadLength = Number(u64Inputs[1]);
    const dataChunks = u64Inputs.slice(2);
    const rawBuf = _decodeChunksToBuffer(dataChunks, payloadLength);

    let payloadStr;
    if (marker === MARKER_GZIP) {
      payloadStr = zlib.gunzipSync(rawBuf).toString('utf8');
    } else {
      payloadStr = rawBuf.toString('utf8');
    }

    const parsed = JSON.parse(payloadStr);
    if (parsed.app !== APP_TAG) return null;

    return parsed;
  } catch (e) {
    return null;
  }
}

/**
 * Riassembla le TX chain-linked.
 * Se una TX ha `_chain`, cerca tutte le parti, le ordina, concatena i buffer,
 * decomprime e restituisce il payload originale completo.
 */
function _reassembleChainedTxs(decodedTxs) {
  const normal = [];
  const chainParts = {}; // key: tag_entityId_version → parts[]

  for (const tx of decodedTxs) {
    if (tx.decoded._chain) {
      const chain = tx.decoded._chain;
      const chainKey = `${chain.tag}_${chain.entityId}_${chain.version}`;
      if (!chainParts[chainKey]) chainParts[chainKey] = [];
      chainParts[chainKey].push({
        part: chain.part,
        total: chain.total,
        data: tx.decoded._data,
        digest: tx.digest,
        timestamp: tx.decoded.timestamp,
        chain: chain,
      });
    } else {
      normal.push(tx);
    }
  }

  // Riassembla ogni chain
  for (const [chainKey, parts] of Object.entries(chainParts)) {
    parts.sort((a, b) => a.part - b.part);

    // Verifica completezza
    if (parts.length !== parts[0].total) {
      sails.log.warn(`[iota] Chain ${chainKey}: ${parts.length}/${parts[0].total} parti trovate (incompleta)`);
      continue;
    }

    try {
      // Concatena i buffer base64 delle parti
      const combinedBuf = Buffer.concat(parts.map(p => Buffer.from(p.data, 'base64')));
      // Decomprimi il payload originale (era stato gzippato prima di essere diviso)
      const payloadStr = zlib.gunzipSync(combinedBuf).toString('utf8');
      const parsed = JSON.parse(payloadStr);

      if (parsed.app !== APP_TAG) continue;

      // Aggiungi come TX normale con il digest dell'ultima parte
      normal.push({
        decoded: parsed,
        digest: parts[parts.length - 1].digest,
        _chainParts: parts.length,
      });

      sails.log.verbose(`[iota] Chain ${chainKey}: riassemblata da ${parts.length} parti`);
    } catch (e) {
      sails.log.warn(`[iota] Chain ${chainKey}: errore riassemblaggio: ${e.message}`);
    }
  }

  return normal;
}

/**
 * Recupera tutte le transazioni exart26 dalla blockchain per il nostro indirizzo.
 * Filtra per tag e entityId.
 */
async function _queryTransactionsFromChain(tag = null, entityId = null, maxResults = 500) {
  try {
    const client = await getClient();
    const address = await getAddress();

    const results = [];
    let cursor = null;
    let hasMore = true;

    // Paginazione: continua a chiedere finche ci sono risultati
    while (hasMore && results.length < maxResults) {
      const opts = {
        filter: { FromAddress: address },
        options: { showInput: true },
        limit: 50,
        order: 'descending',
      };
      if (cursor) opts.cursor = cursor;

      const txBlocks = await client.queryTransactionBlocks(opts);

      for (const tx of txBlocks.data) {
        const decoded = _decodeTransactionPayload(tx);
        if (!decoded) continue;
        if (tag && decoded.tag !== tag) continue;
        if (entityId !== null && entityId !== undefined && String(decoded.entityId) !== String(entityId)) continue;
        results.push({
          payload: decoded.data,
          version: decoded.version,
          timestamp: decoded.timestamp,
          digest: tx.digest,
          tag: decoded.tag,
          entityId: decoded.entityId,
        });
      }

      hasMore = txBlocks.hasNextPage;
      cursor = txBlocks.nextCursor;
    }

    return results;
  } catch (e) {
    console.error('[iota] _queryTransactionsFromChain error:', e.message);
    return [];
  }
}

/**
 * Recupera l'ultimo dato pubblicato con un certo tag dalla blockchain.
 * ZERO database locale - legge direttamente dalla chain.
 */
async function getLastDataByTag(tag, entityId = null) {
  const results = await _queryTransactionsFromChain(tag, entityId, 50);
  return results.length > 0 ? results[0] : null;
}

/**
 * Recupera tutti i dati pubblicati con un certo tag dalla blockchain.
 */
async function getAllDataByTag(tag, entityId = null) {
  return await _queryTransactionsFromChain(tag, entityId, 100);
}

// --- Cache per sync bulk (evita query multiple della stessa chain) ---
let _bulkCache = null;

/**
 * Scarica TUTTE le transazioni dalla chain UNA SOLA VOLTA e le partiziona per tag.
 * Evita di ri-scaricare e ri-decodificare tutte le TX per ogni chiamata getAllDataByTag.
 * Chiama clearBulkCache() quando la sync e finita per liberare memoria.
 */
async function getAllTransactionsCached() {
  if (_bulkCache) return _bulkCache;

  const client = await getClient();
  const address = await getAddress();

  const byTag = {};
  let cursor = null;
  let hasMore = true;
  let totalDecoded = 0;
  let totalFetched = 0;
  let totalSkipped = 0;
  let pages = 0;

  while (hasMore) {
    const opts = {
      filter: { FromAddress: address },
      options: { showInput: true },
      limit: 50,
      order: 'descending',
    };
    if (cursor) opts.cursor = cursor;

    const txBlocks = await client.queryTransactionBlocks(opts);
    pages++;
    totalFetched += txBlocks.data.length;

    // Prima passata: decodifica tutte le TX (normali + chain parts)
    const allDecodedInPage = [];
    for (const tx of txBlocks.data) {
      const decoded = _decodeTransactionPayload(tx);
      if (!decoded) {
        totalSkipped++;
        continue;
      }
      allDecodedInPage.push({ decoded, digest: tx.digest });
      totalDecoded++;
    }

    // Riassembla eventuali chain-linked TX
    const reassembled = _reassembleChainedTxs(allDecodedInPage);

    for (const tx of reassembled) {
      const d = tx.decoded;
      const t = d.tag || d._chain?.tag || '_unknown';
      if (!byTag[t]) byTag[t] = [];
      byTag[t].push({
        payload: d.data,
        version: d.version,
        timestamp: d.timestamp,
        digest: tx.digest,
        tag: d.tag,
        entityId: d.entityId,
      });
    }

    hasMore = txBlocks.hasNextPage;
    cursor = txBlocks.nextCursor;
  }

  const tagSummary = Object.entries(byTag).map(([t, arr]) => `${t}:${arr.length}`).join(', ');
  sails.log.info(`[iota] Bulk cache: ${pages} pagine, ${totalFetched} TX scaricate, ${totalDecoded} decodificate, ${totalSkipped} skippate, tag: [${tagSummary}]`);
  _bulkCache = byTag;
  return _bulkCache;
}

/**
 * Recupera TX per tag dalla bulk cache (se disponibile) o dalla chain.
 */
async function getByTagFromCache(tag, entityId = null) {
  if (_bulkCache) {
    let results = _bulkCache[tag] || [];
    if (entityId !== null && entityId !== undefined) {
      results = results.filter(r => String(r.entityId) === String(entityId));
    }
    return results;
  }
  return await _queryTransactionsFromChain(tag, entityId, 100);
}

/**
 * Libera la bulk cache dalla memoria.
 */
function clearBulkCache() {
  _bulkCache = null;
}

// --- Request faucet ---

async function requestFaucet() {
  const sdk = await loadSdk();
  const address = await getAddress();
  const config = _getConfig();
  const network = config.IOTA_NETWORK || 'testnet';
  await sdk.requestIotaFromFaucetV1({
    host: sdk.getFaucetHost(network),
    recipient: address,
  });
  return { success: true, address };
}

// =========================================================================
// Move contract integration
// =========================================================================

const ADMIN_TAGS = ['FORUM_ROLE', 'FORUM_CONFIG'];
const MOD_TAGS = ['FORUM_MODERATION', 'FORUM_CATEGORY'];
const CLOCK_OBJECT_ID = '0x6';

/**
 * Check if Move mode is enabled (contract deployed).
 */
function isMoveModeEnabled() {
  const config = _getConfig();
  return !!(config.FORUM_PACKAGE_ID && config.FORUM_OBJECT_ID);
}

/**
 * Get Move contract IDs from config.
 * Returns all 5 shared object IDs + adminCap.
 */
function _getMoveConfig() {
  const config = _getConfig();
  return {
    packageId: config.FORUM_PACKAGE_ID,
    forumObjectId: config.FORUM_OBJECT_ID,
    registryId: config.FORUM_REGISTRY_ID,
    treasuryId: config.FORUM_TREASURY_ID,
    subscriptionStoreId: config.FORUM_SUBSCRIPTION_STORE_ID,
    marketplaceStoreId: config.FORUM_MARKETPLACE_STORE_ID,
    adminCapId: config.ADMIN_CAP_ID,
  };
}

/**
 * Publish data via Move contract call.
 * Replaces the legacy split-coins encoding with a proper moveCall.
 *
 * @param {string} tag - Forum tag (FORUM_USER, FORUM_POST, etc.)
 * @param {object} dataObject - The data to publish
 * @param {string} entityId - Unique entity identifier
 * @param {number} version - Data version
 * @returns {{ success, digest, error, explorerUrl }}
 */
async function publishDataMove(tag, dataObject, entityId, version = 1) {
  return _enqueueTx(async () => {
    try {
      const sdk = await loadSdk();
      const client = await getClient();
      const keypair = await getKeypair();
      const { packageId, forumObjectId, registryId, adminCapId } = _getMoveConfig();

      if (!packageId || !forumObjectId) {
        throw new Error('Move contract not deployed. Run move-publish.js first.');
      }

      // Gzip the data payload
      const jsonStr = JSON.stringify(dataObject);
      const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));

      const config = _getConfig();
      const network = config.IOTA_NETWORK || 'testnet';
      const explorerBase = config.IOTA_EXPLORER_URL || 'https://explorer.rebased.iota.org';

      // Build transaction
      const tx = new sdk.Transaction();

      const isRegistration = tag === 'FORUM_USER' && version === 1;
      const isAdmin = ADMIN_TAGS.includes(tag);
      const isMod = MOD_TAGS.includes(tag);

      // Common args for post_event / mod_post_event / admin_post_event
      const commonArgs = [
        tx.pure.vector('u8', Array.from(Buffer.from(tag, 'utf8'))),
        tx.pure.vector('u8', Array.from(Buffer.from(entityId, 'utf8'))),
        tx.pure.vector('u8', Array.from(compressed)),
        tx.pure.u64(version),
        tx.object(CLOCK_OBJECT_ID),
      ];

      if (isRegistration) {
        // register(registry, entity_id, data, clock) — takes UserRegistry only
        tx.moveCall({
          target: `${packageId}::forum::register`,
          arguments: [
            tx.object(registryId),
            tx.pure.vector('u8', Array.from(Buffer.from(entityId, 'utf8'))),
            tx.pure.vector('u8', Array.from(compressed)),
            tx.object(CLOCK_OBJECT_ID),
          ],
        });
      } else if (isAdmin) {
        // admin_post_event(forum, registry, tag, entity_id, data, version, clock)
        tx.moveCall({
          target: `${packageId}::forum::admin_post_event`,
          arguments: [tx.object(forumObjectId), tx.object(registryId), ...commonArgs],
        });
      } else if (isMod) {
        // mod_post_event(forum, registry, tag, entity_id, data, version, clock)
        tx.moveCall({
          target: `${packageId}::forum::mod_post_event`,
          arguments: [tx.object(forumObjectId), tx.object(registryId), ...commonArgs],
        });
      } else {
        // post_event(forum, registry, tag, entity_id, data, version, clock)
        tx.moveCall({
          target: `${packageId}::forum::post_event`,
          arguments: [tx.object(forumObjectId), tx.object(registryId), ...commonArgs],
        });
      }

      tx.setGasBudget(50_000_000); // 0.05 IOTA — much cheaper than split-coins

      sails.log.info(`[iota] publishDataMove: tag=${tag} entityId=${entityId} json=${jsonStr.length}B gz=${compressed.length}B (-${Math.round((1 - compressed.length / jsonStr.length) * 100)}%)`);

      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status !== 'success') {
        const errMsg = result.effects?.status?.error || 'Transaction failed';
        sails.log.error(`[iota] publishDataMove FAILED: ${errMsg}`);
        return {
          success: false,
          digest: result.digest,
          error: errMsg,
          explorerUrl: `${explorerBase}/txblock/${result.digest}?network=${network}`,
        };
      }

      sails.log.info(`[iota] publishDataMove OK: ${result.digest}`);
      return {
        success: true,
        digest: result.digest,
        error: null,
        explorerUrl: `${explorerBase}/txblock/${result.digest}?network=${network}`,
      };

    } catch (err) {
      sails.log.error(`[iota] publishDataMove ERROR: ${err.message}`);
      return { success: false, digest: null, error: err.message, explorerUrl: null };
    }
  });
}

/**
 * Change a user's role on-chain via Move contract.
 * Requires the caller to be MODERATOR or ADMIN.
 * @param {string} targetAddress - IOTA address of the user
 * @param {number} newRole - 0=banned, 1=user, 2=moderator, 3=admin
 */
async function setUserRole(targetAddress, newRole) {
  return _enqueueTx(async () => {
    try {
      const sdk = await loadSdk();
      const client = await getClient();
      const keypair = await getKeypair();
      const { packageId, registryId } = _getMoveConfig();

      const tx = new sdk.Transaction();
      tx.moveCall({
        target: `${packageId}::forum::set_user_role`,
        arguments: [
          tx.object(registryId),
          tx.pure.address(targetAddress),
          tx.pure.u8(newRole),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
      tx.setGasBudget(10_000_000);

      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status !== 'success') {
        return { success: false, error: result.effects?.status?.error || 'TX failed' };
      }

      sails.log.info(`[iota] setUserRole: ${targetAddress} -> role ${newRole} (TX: ${result.digest})`);
      return { success: true, digest: result.digest };
    } catch (err) {
      sails.log.error(`[iota] setUserRole ERROR: ${err.message}`);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Query all forum events from the Move contract.
 * Replaces getAllTransactionsCached() for Move mode.
 * Returns data partitioned by tag, same format as the legacy function.
 */
async function queryForumEvents(remotePackageId = null) {
  const config = _getConfig();
  const client = await getClient();
  const packageId = remotePackageId || config.FORUM_PACKAGE_ID;

  if (!packageId) {
    throw new Error('FORUM_PACKAGE_ID not configured.');
  }

  const byTag = {};
  let cursor = null;
  let hasMore = true;
  let totalEvents = 0;

  while (hasMore) {
    const opts = {
      query: { MoveModule: { package: packageId, module: 'forum' } },
      limit: 50,
      order: 'ascending', // oldest first for correct version ordering
    };
    if (cursor) opts.cursor = cursor;

    const result = await client.queryEvents(opts);

    for (const ev of result.data) {
      try {
        const parsed = ev.parsedJson;
        sails.log.info(`[iota] RAW EVENT parsedJson keys: ${Object.keys(parsed || {}).join(',')} | tag=${parsed?.tag} | author=${parsed?.author} | entity_id=${parsed?.entity_id} | version=${parsed?.version}`);
        if (!parsed || !parsed.tag) {
          // Handle RoleChanged events (emitted by set_user_role, different struct)
          if (parsed?.new_role !== undefined && parsed?.user) {
            sails.log.info(`[iota] RoleChanged event: user=${parsed.user} new_role=${parsed.new_role} changed_by=${parsed.changed_by}`);
            const roleNames = { 0: 'banned', 1: 'user', 2: 'moderator', 3: 'admin' };
            if (!byTag['ROLE_CHANGED']) byTag['ROLE_CHANGED'] = [];
            byTag['ROLE_CHANGED'].push({
              payload: {
                targetUserId: parsed.user,
                role: roleNames[parsed.new_role] || 'user',
                oldRole: roleNames[parsed.old_role] || 'user',
                grantedBy: parsed.changed_by,
              },
              version: 1,
              timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
              digest: ev.id?.txDigest,
              tag: 'ROLE_CHANGED',
              entityId: parsed.user,
              author: parsed.changed_by,
            });
            totalEvents++;
          }
          // Handle EscrowUpdated events (emitted by mark_delivered, open_dispute, vote_release, vote_refund, claim_expired)
          else if (parsed?.escrow_id && parsed?.action) {
            sails.log.info(`[iota] EscrowUpdated event: escrow_id=${parsed.escrow_id} action=${parsed.action} actor=${parsed.actor}`);
            if (!byTag['FORUM_ESCROW_UPDATED']) byTag['FORUM_ESCROW_UPDATED'] = [];
            byTag['FORUM_ESCROW_UPDATED'].push({
              payload: {
                id: parsed.escrow_id,
                escrowId: parsed.escrow_id,
                action: parsed.action,
                actor: parsed.actor,
              },
              version: 1,
              timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
              digest: ev.id?.txDigest,
              tag: 'FORUM_ESCROW_UPDATED',
              entityId: parsed.escrow_id,
              author: parsed.actor,
            });
            totalEvents++;
          } else {
            sails.log.warn(`[iota] Skipping unknown event. Keys: ${Object.keys(parsed || {}).join(',')}`);
          }
          continue;
        }

        const tag = parsed.tag;
        // Decode gzipped data
        let payload;
        try {
          // parsedJson.data is an array of u8 bytes
          const dataBytes = Buffer.from(parsed.data);
          const jsonStr = zlib.gunzipSync(dataBytes).toString('utf8');
          payload = JSON.parse(jsonStr);
          sails.log.info(`[iota] DECODED payload for ${tag}: ${JSON.stringify(payload).substring(0, 300)}`);
        } catch (decErr) {
          sails.log.warn(`[iota] Gzip decode failed for ${tag}: ${decErr.message}, trying fallback`);
          // Fallback: data might be uncompressed JSON string
          payload = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data;
          sails.log.info(`[iota] FALLBACK payload for ${tag}: ${JSON.stringify(payload).substring(0, 300)}`);
        }

        const record = {
          payload,
          version: parsed.version ? Number(parsed.version) : 1,
          timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
          digest: ev.id?.txDigest,
          tag,
          entityId: parsed.entity_id,
          author: parsed.author,
        };
        sails.log.info(`[iota] RECORD: tag=${record.tag} author=${record.author} entityId=${record.entityId} digest=${record.digest}`);

        if (!byTag[tag]) byTag[tag] = [];
        byTag[tag].push(record);
        totalEvents++;
      } catch (err) {
        sails.log.warn(`[iota] queryForumEvents: error decoding event:`, err.message);
        sails.log.warn(`[iota] Full event dump: ${JSON.stringify(ev).substring(0, 500)}`);
      }
    }

    hasMore = result.hasNextPage;
    cursor = result.nextCursor;
  }

  const tagSummary = Object.entries(byTag).map(([t, arr]) => `${t}:${arr.length}`).join(', ');
  sails.log.info(`[iota] queryForumEvents: ${totalEvents} events, tags: [${tagSummary}]`);

  return byTag;
}

/**
 * Query forum events starting from a cursor (for incremental polling).
 * Returns { events: [{tag, payload, ...}], nextCursor, lastCursor }
 */
async function queryForumEventsSince(startCursor = null) {
  const config = _getConfig();
  const client = await getClient();
  const packageId = config.FORUM_PACKAGE_ID;

  if (!packageId) {
    throw new Error('FORUM_PACKAGE_ID not configured.');
  }

  const events = [];
  let cursor = startCursor;
  let hasMore = true;
  let lastCursor = startCursor;

  while (hasMore) {
    const opts = {
      query: { MoveModule: { package: packageId, module: 'forum' } },
      limit: 50,
      order: 'ascending',
    };
    if (cursor) opts.cursor = cursor;

    const result = await client.queryEvents(opts);

    for (const ev of result.data) {
      try {
        const parsed = ev.parsedJson;
        if (!parsed) continue;

        // Handle non-ForumEvent structs (no tag field)
        if (!parsed.tag) {
          // RoleChanged
          if (parsed.new_role !== undefined && parsed.user) {
            const roleNames = { 0: 'banned', 1: 'user', 2: 'moderator', 3: 'admin' };
            events.push({
              payload: {
                targetUserId: parsed.user,
                role: roleNames[parsed.new_role] || 'user',
                oldRole: roleNames[parsed.old_role] || 'user',
                grantedBy: parsed.changed_by,
              },
              version: 1,
              timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
              digest: ev.id?.txDigest,
              tag: 'ROLE_CHANGED',
              entityId: parsed.user,
              author: parsed.changed_by,
            });
          }
          // EscrowUpdated
          else if (parsed.escrow_id && parsed.action) {
            events.push({
              payload: {
                id: parsed.escrow_id,
                escrowId: parsed.escrow_id,
                action: parsed.action,
                actor: parsed.actor,
              },
              version: 1,
              timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
              digest: ev.id?.txDigest,
              tag: 'FORUM_ESCROW_UPDATED',
              entityId: parsed.escrow_id,
              author: parsed.actor,
            });
          }
          continue;
        }

        let payload;
        try {
          const dataBytes = Buffer.from(parsed.data);
          const jsonStr = zlib.gunzipSync(dataBytes).toString('utf8');
          payload = JSON.parse(jsonStr);
        } catch (decErr) {
          payload = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data;
        }

        events.push({
          payload,
          version: parsed.version ? Number(parsed.version) : 1,
          timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
          digest: ev.id?.txDigest,
          tag: parsed.tag,
          entityId: parsed.entity_id,
          author: parsed.author,
        });
      } catch (err) {
        sails.log.warn(`[iota] queryForumEventsSince: error decoding event:`, err.message);
      }
    }

    hasMore = result.hasNextPage;
    if (result.nextCursor) {
      lastCursor = result.nextCursor;
    }
    cursor = result.nextCursor;
  }

  return { events, lastCursor };
}

/**
 * Subscribe to real-time forum events via WebSocket.
 * Calls onEvent(decodedEvent) for each new event from the smart contract.
 * Returns an unsubscribe function.
 *
 * @param {function} onEvent - callback({ tag, payload, entityId, digest, ... })
 * @returns {Promise<function>} unsubscribe function
 */
async function subscribeToForumEvents(onEvent) {
  const config = _getConfig();
  const client = await getClient();
  const packageId = config.FORUM_PACKAGE_ID;

  if (!packageId) {
    throw new Error('FORUM_PACKAGE_ID not configured — cannot subscribe.');
  }

  sails.log.info(`[iota] Subscribing to real-time events for package ${packageId}...`);

  const unsubscribe = await client.subscribeEvent({
    filter: { MoveModule: { package: packageId, module: 'forum' } },
    onMessage: (event) => {
      try {
        const parsed = event.parsedJson;
        if (!parsed) return;

        // Handle non-ForumEvent structs (no tag field)
        if (!parsed.tag) {
          // RoleChanged
          if (parsed.new_role !== undefined && parsed.user) {
            const roleNames = { 0: 'banned', 1: 'user', 2: 'moderator', 3: 'admin' };
            onEvent({
              payload: {
                targetUserId: parsed.user,
                role: roleNames[parsed.new_role] || 'user',
                oldRole: roleNames[parsed.old_role] || 'user',
                grantedBy: parsed.changed_by,
              },
              version: 1,
              timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
              digest: event.id?.txDigest,
              tag: 'ROLE_CHANGED',
              entityId: parsed.user,
              author: parsed.changed_by,
            });
          }
          // EscrowUpdated
          else if (parsed.escrow_id && parsed.action) {
            onEvent({
              payload: {
                id: parsed.escrow_id,
                escrowId: parsed.escrow_id,
                action: parsed.action,
                actor: parsed.actor,
              },
              version: 1,
              timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
              digest: event.id?.txDigest,
              tag: 'FORUM_ESCROW_UPDATED',
              entityId: parsed.escrow_id,
              author: parsed.actor,
            });
          }
          return;
        }

        let payload;
        try {
          const dataBytes = Buffer.from(parsed.data);
          const jsonStr = zlib.gunzipSync(dataBytes).toString('utf8');
          payload = JSON.parse(jsonStr);
        } catch (decErr) {
          payload = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data;
        }

        onEvent({
          payload,
          version: parsed.version ? Number(parsed.version) : 1,
          timestamp: parsed.timestamp ? Number(parsed.timestamp) : null,
          digest: event.id?.txDigest,
          tag: parsed.tag,
          entityId: parsed.entity_id,
          author: parsed.author,
        });
      } catch (err) {
        sails.log.warn(`[iota] subscribeToForumEvents: error decoding event:`, err.message);
      }
    },
  });

  sails.log.info(`[iota] Subscribed to real-time forum events OK`);
  return unsubscribe;
}

/**
 * Query forum events for a specific entity (for history).
 */
async function queryForumEventsByEntity(tag, entityId) {
  const byTag = await queryForumEvents();
  const records = byTag[tag] || [];
  if (!entityId) return records;
  return records.filter(r => String(r.entityId) === String(entityId));
}

// --- Exports ---

/**
 * Reset dello stato runtime (per reinizializzazione wallet).
 */
function _resetRuntime() {
  _keypair = null;
  _client = null;
  _address = null;
  _config = null;
  // Forza il reload del config alla prossima chiamata
  delete require.cache[require.resolve('../../config/private_iota_conf')];
}

module.exports = {
  setSocketId,
  stringToHex,
  hexToString,
  isWalletInitialized,
  getOrInitWallet,
  getStatusAndBalance,
  getAddress,
  showBalanceFormatted,
  publishData,
  getPendingTxCount,
  getLastDataByTag,
  getAllDataByTag,
  getAllTransactionsCached,
  getByTagFromCache,
  clearBulkCache,
  requestFaucet,
  waitForFunds,
  GET_MAIN_KEYS,
  getClient,
  getKeypair,
  loadSdk,
  _resetRuntime,
  ASSISTITO_ACCOUNT_PREFIX,
  // Move contract
  isMoveModeEnabled,
  publishDataMove,
  queryForumEvents,
  queryForumEventsSince,
  queryForumEventsByEntity,
  subscribeToForumEvents,
  setUserRole,
};
