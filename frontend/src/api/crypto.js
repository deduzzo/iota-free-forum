/**
 * Client-side cryptography for IotaPolis.
 *
 * Primary identity: IOTA Ed25519 keypair derived from BIP39 mnemonic.
 * Mnemonic encrypted with AES-256-GCM (password-based) for localStorage.
 *
 * Retained from legacy:
 *   - AES-256-CBC encrypt/decrypt (paid content encryption)
 *   - RSA-OAEP encrypt/decrypt (key exchange for paid content)
 */

import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { IotaClient, getFullnodeUrl } from '@iota/iota-sdk/client';
import { Transaction } from '@iota/iota-sdk/transactions';
import { decodeIotaPrivateKey as _decodeIotaPrivateKey } from '@iota/iota-sdk/cryptography';
import { x25519 } from '@noble/curves/ed25519';
import { edwardsToMontgomeryPub, edwardsToMontgomeryPriv } from '@noble/curves/ed25519';
import { generateMnemonic as _genMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// ─── IOTA Network Client (singleton) ────────────────────────────────────────

let _client = null;
let _networkUrl = null;

/**
 * Set the RPC endpoint URL for the IOTA client.
 * Call this after fetching /api/v1/forum-info to use the correct network.
 * @param {string} url - Full RPC endpoint URL
 * @returns {void}
 */
export function setNetworkUrl(url) {
  if (url && url !== _networkUrl) {
    _networkUrl = url;
    _client = new IotaClient({ url });
  }
}

/**
 * Configure the client from a network name (e.g. 'testnet', 'mainnet').
 * @param {string} network - Network name ('testnet' | 'mainnet')
 * @returns {void}
 */
export function setNetwork(network) {
  const url = getFullnodeUrl(network);
  setNetworkUrl(url);
}

/**
 * Get the singleton IotaClient.
 * Falls back to testnet if not yet configured.
 * @returns {import('@iota/iota-sdk/client').IotaClient}
 */
export function getClient() {
  if (!_client) {
    const url = _networkUrl || getFullnodeUrl('testnet');
    _networkUrl = url;
    _client = new IotaClient({ url });
  }
  return _client;
}

// Re-export for transaction building
export { Transaction };

// IOTA system clock shared object
export const CLOCK_OBJECT_ID = '0x6';

// ─── BIP39 Mnemonic ─────────────────────────────────────────────────────────

/**
 * Generate a 12-word BIP39 mnemonic.
 * @returns {string} Space-separated 12-word mnemonic
 */
export function generateMnemonic() {
  return _genMnemonic(wordlist, 128);
}

/**
 * Validate a BIP39 mnemonic string.
 * @param {string} mnemonic - Mnemonic to validate
 * @returns {boolean}
 */
export function isValidMnemonic(mnemonic) {
  if (!mnemonic || typeof mnemonic !== 'string') return false;
  return validateMnemonic(mnemonic.trim(), wordlist);
}

// ─── Ed25519 Keypair ─────────────────────────────────────────────────────────

/**
 * Derive an Ed25519Keypair from a BIP39 mnemonic.
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @returns {import('@iota/iota-sdk/keypairs/ed25519').Ed25519Keypair}
 */
export function keypairFromMnemonic(mnemonic) {
  return Ed25519Keypair.deriveKeypair(mnemonic.trim());
}

/**
 * Get the IOTA address (0x...) from a keypair.
 * @param {import('@iota/iota-sdk/keypairs/ed25519').Ed25519Keypair} keypair
 * @returns {string} IOTA address (0x...)
 */
export function getAddress(keypair) {
  return keypair.getPublicKey().toIotaAddress();
}

// ─── Mnemonic Encryption (AES-256-GCM, password-based) ──────────────────────

/**
 * Derive an AES-256-GCM key from a password + salt via PBKDF2 (600k rounds).
 */
async function deriveKeyFromPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt mnemonic with a user password (AES-256-GCM).
 * Returns a base64 string containing: salt(16) || iv(12) || ciphertext+tag.
 * @param {string} mnemonic - BIP39 mnemonic to encrypt
 * @param {string} password - User password for encryption
 * @returns {Promise<string>} Base64-encoded encrypted mnemonic
 */
export async function encryptMnemonic(mnemonic, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(password, salt);
  const encoded = new TextEncoder().encode(mnemonic);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  const result = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return arrayBufferToBase64(result.buffer);
}

/**
 * Decrypt mnemonic with user password (AES-256-GCM).
 * Throws on wrong password.
 * @param {string} encryptedBase64 - Base64-encoded encrypted mnemonic
 * @param {string} password - User password for decryption
 * @returns {Promise<string>} Decrypted mnemonic phrase
 * @throws {Error} If password is wrong or data is corrupted
 */
export async function decryptMnemonic(encryptedBase64, password) {
  const data = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ciphertext = data.slice(28);
  const key = await deriveKeyFromPassword(password, salt);
  try {
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new Error('Wrong password or corrupted data');
  }
}

// ─── Sign & Execute Transaction ──────────────────────────────────────────────

/**
 * Sign a Transaction with the user's Ed25519 keypair and execute on the IOTA network.
 * Waits for confirmation before returning.
 * @param {import('@iota/iota-sdk/keypairs/ed25519').Ed25519Keypair} keypair - User's keypair
 * @param {import('@iota/iota-sdk/transactions').Transaction} transactionBlock - Transaction to sign and execute
 * @returns {Promise<{digest: string, effects: Object, events: Object[]}>}
 */
export async function signAndExecuteTransaction(keypair, transactionBlock) {
  const client = getClient();
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: transactionBlock,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  return result;
}

// ─── Gzip compression (for on-chain data payloads) ──────────────────────────

/**
 * Gzip-compress a JSON-serialisable object.
 * Returns Uint8Array suitable for passing as vector<u8> in Move calls.
 * @param {Object} jsonObject - JSON-serializable object to compress
 * @returns {Promise<Uint8Array>} Gzipped bytes
 */
export async function gzipCompress(jsonObject) {
  const jsonStr = JSON.stringify(jsonObject);
  const stream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream('gzip'));
  const blob = await new Response(stream).blob();
  return new Uint8Array(await blob.arrayBuffer());
}

// ─── Helpers: base64 / PEM ──────────────────────────────────────────────────

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  return base64ToArrayBuffer(b64);
}

// ─── AES-256-CBC (for paid content encryption) ──────────────────────────────

async function importAESKey(keyBase64) {
  const raw = base64ToArrayBuffer(keyBase64);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function computeHMAC(keyBase64, data) {
  const keyBytes = base64ToArrayBuffer(keyBase64);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, data);
  return arrayBufferToBase64(sig);
}

/**
 * AES-256-CBC encrypt with HMAC-SHA256 integrity.
 * Returns { iv, ciphertext, hmac } — all base64.
 */
export async function encryptAES(plaintext, keyBase64) {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await importAESKey(keyBase64);
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    aesKey,
    encoded,
  );

  const ivB64 = arrayBufferToBase64(iv.buffer);
  const ciphertextB64 = arrayBufferToBase64(cipherBuffer);

  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);
  const hmac = await computeHMAC(keyBase64, combined.buffer);

  return { iv: ivB64, ciphertext: ciphertextB64, hmac };
}

/**
 * AES-256-CBC decrypt. Verifies HMAC before decrypting.
 */
export async function decryptAES(encrypted, keyBase64) {
  const { iv, ciphertext, hmac } = encrypted;

  const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));
  const cipherBytes = new Uint8Array(base64ToArrayBuffer(ciphertext));

  const combined = new Uint8Array(ivBytes.byteLength + cipherBytes.byteLength);
  combined.set(ivBytes, 0);
  combined.set(cipherBytes, ivBytes.byteLength);
  const computedHmac = await computeHMAC(keyBase64, combined.buffer);

  if (computedHmac !== hmac) {
    throw new Error('HMAC verification failed — data may be tampered');
  }

  const aesKey = await importAESKey(keyBase64);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: ivBytes },
    aesKey,
    cipherBytes,
  );

  return new TextDecoder().decode(plainBuffer);
}

// ─── RSA-OAEP (key exchange for paid content) ───────────────────────────────

async function importEncryptPublicKey(pem) {
  const der = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'spki',
    der,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

async function importEncryptPrivateKey(pem) {
  const der = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
}

/**
 * RSA-OAEP encrypt a short string with a public key PEM.
 */
export async function encryptRSA(data, publicKeyPem) {
  const key = await importEncryptPublicKey(publicKeyPem);
  const encoded = new TextEncoder().encode(data);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, encoded);
  return arrayBufferToBase64(cipherBuffer);
}

/**
 * RSA-OAEP decrypt with a private key PEM.
 */
export async function decryptRSA(ciphertext, privateKeyPem) {
  const key = await importEncryptPrivateKey(privateKeyPem);
  const cipherBuffer = base64ToArrayBuffer(ciphertext);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, cipherBuffer);
  return new TextDecoder().decode(plainBuffer);
}

// ─── X25519 DM Encryption (E2E via Diffie-Hellman) ─────────────────────────

/**
 * Convert Ed25519 private key (32 bytes seed) to X25519 private key.
 * Used for Diffie-Hellman key exchange.
 */
export function ed25519ToX25519Private(ed25519PrivateKey) {
  return edwardsToMontgomeryPriv(ed25519PrivateKey);
}

/**
 * Convert Ed25519 public key (32 bytes) to X25519 public key.
 */
export function ed25519ToX25519Public(ed25519PublicKey) {
  return edwardsToMontgomeryPub(ed25519PublicKey);
}

/**
 * Derive a shared secret via X25519 Diffie-Hellman, then hash with SHA-256
 * for use as AES-256-GCM key.
 */
export async function deriveSharedSecret(myX25519Private, theirX25519Public) {
  const raw = x25519.getSharedSecret(myX25519Private, theirX25519Public);
  // Hash the raw shared secret with Web Crypto SHA-256 for a uniform 256-bit key
  const hashBuffer = await crypto.subtle.digest('SHA-256', raw);
  return new Uint8Array(hashBuffer);
}

/**
 * Encrypt a DM plaintext with AES-256-GCM using a shared secret.
 * Returns { ciphertext: base64, iv: base64 }.
 */
export async function encryptDM(plaintext, sharedSecret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  return {
    ciphertext: arrayBufferToBase64(cipherBuffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt a DM ciphertext with AES-256-GCM using a shared secret.
 * @param {string} ciphertextB64 - base64 ciphertext
 * @param {string} ivB64 - base64 IV
 * @param {Uint8Array} sharedSecret - 32 bytes shared secret
 */
export async function decryptDM(ciphertextB64, ivB64, sharedSecret) {
  const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
  const cipherBytes = new Uint8Array(base64ToArrayBuffer(ciphertextB64));
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  try {
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBytes,
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new Error('Failed to decrypt message — wrong key or corrupted data');
  }
}

/**
 * Get the raw Ed25519 keypair bytes for DM encryption.
 * @param {Ed25519Keypair} keypair - IOTA SDK keypair
 * @returns {{ privateKey: Uint8Array, publicKey: Uint8Array }}
 */
export function getKeypairBytes(keypair) {
  const publicKey = keypair.getPublicKey().toRawBytes();
  // The IOTA SDK Ed25519Keypair stores secretKey (32 bytes seed) on .keypair
  // Decode from Bech32 via getSecretKey() as a fallback-safe approach
  const bech32Key = keypair.getSecretKey();
  // The bech32 encoded key from IOTA SDK: decode it
  // Format: iotaprivkey1<bech32data> — we import the decode helper
  const { secretKey: rawBytes } = _decodeIotaPrivateKey(bech32Key);
  return { privateKey: rawBytes, publicKey };
}
