import { useState, useEffect, useCallback, useRef } from 'react';
import {
  generateMnemonic,
  keypairFromMnemonic,
  getAddress,
  encryptMnemonic,
  decryptMnemonic,
  isValidMnemonic,
  signAndExecuteTransaction,
  Transaction,
  CLOCK_OBJECT_ID,
  gzipCompress,
  setNetwork,
  getClient,
} from '../api/crypto';
import {
  addTransaction,
  updateTransaction,
  completeTransaction,
  failTransaction,
  getTransactionStatus,
} from './useTransactions';
import { api } from '../api/endpoints';

const STORAGE_KEY = 'forum_identity';

/**
 * React hook that manages the user's IOTA Ed25519 identity.
 *
 * Storage layout in localStorage (STORAGE_KEY):
 *   { encryptedMnemonic: string, address: string, username: string|null }
 *
 * The keypair is NEVER stored — it's derived from the mnemonic each session.
 */
// ── Shared singleton state (across all hook instances) ─────────────────────
let _keypair = null;
let _unlocked = false;
const _unlockListeners = new Set();

function _setGlobalUnlocked(val, kp = null) {
  _unlocked = val;
  _keypair = kp;
  _unlockListeners.forEach(fn => fn(val));
}

/**
 * @typedef {Object} IdentityState
 * @property {{address: string, username: string|null, encryptedMnemonic: string, userId: string}|null} identity - Current identity (null if not set up)
 * @property {boolean} unlocked - Whether the wallet is unlocked (keypair in memory)
 * @property {boolean} loading - Whether the identity is still loading from localStorage
 * @property {{packageId: string, forumObjectId: string, registryId: string|null, treasuryId: string|null, subscriptionStoreId: string|null, marketplaceStoreId: string|null, network: string, explorerUrl: string}|null} forumConfig
 * @property {import('@iota/iota-sdk/keypairs/ed25519').Ed25519Keypair|null} keypair
 * @property {(password: string) => Promise<{mnemonic: string, address: string}>} generateIdentity
 * @property {() => void} confirmMnemonicSaved
 * @property {(password: string) => Promise<boolean>} unlockIdentity
 * @property {() => void} lockIdentity
 * @property {(username: string) => Promise<Object>} registerUsername
 * @property {(tx: import('@iota/iota-sdk/transactions').Transaction) => Promise<Object>} signAndSendTx
 * @property {(tag: string, entityId: string, dataObject: Object, version?: number) => Promise<Object>} postEvent
 * @property {(password: string) => Promise<string>} exportMnemonic
 * @property {(mnemonic: string, password: string) => Promise<Object>} importIdentity
 * @property {(oldPassword: string, newPassword: string) => Promise<boolean>} changePassword
 * @property {() => void} clearIdentity
 * @property {() => Promise<Object|null>} getBalance
 * @property {(url: string, method: string, data?: Object) => Promise<Response>} signAndSend
 */

/**
 * React hook that manages the user's IOTA Ed25519 identity.
 * @returns {IdentityState}
 */
export function useIdentity() {
  const [identity, setIdentity] = useState(null);   // { address, username, encryptedMnemonic }
  const [unlocked, setUnlocked] = useState(_unlocked);
  const [loading, setLoading] = useState(true);
  const [forumConfig, setForumConfig] = useState(null); // { packageId, forumObjectId, registryId, treasuryId, subscriptionStoreId, marketplaceStoreId, network }

  // Sync local state with global singleton
  useEffect(() => {
    const listener = (val) => setUnlocked(val);
    _unlockListeners.add(listener);
    // Sync initial state
    setUnlocked(_unlocked);
    return () => _unlockListeners.delete(listener);
  }, []);

  // Ref that always points to the global keypair
  const keypairRef = useRef(null);
  keypairRef.current = _keypair;

  // ── Load stored identity + forum config on mount ──────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setIdentity(parsed);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setLoading(false);
  }, []);

  // Fetch forum config (packageId, forumObjectId, registryId, etc.) once
  useEffect(() => {
    let cancelled = false;
    api.getForumInfo()
      .then((info) => {
        if (cancelled || !info.success) return;
        const cfg = {
          packageId: info.packageId,
          forumObjectId: info.forumObjectId,
          registryId: info.registryId || null,
          treasuryId: info.treasuryId || null,
          subscriptionStoreId: info.subscriptionStoreId || null,
          marketplaceStoreId: info.marketplaceStoreId || null,
          governanceStoreId: info.governanceStoreId || null,
          network: info.network || 'testnet',
          explorerUrl: info.explorerUrl,
        };
        setForumConfig(cfg);
        // Configure IOTA client with the correct network
        if (cfg.network) setNetwork(cfg.network);
      })
      .catch(() => { /* forum-info not available yet */ });
    return () => { cancelled = true; };
  }, []);

  // ── Persist helper ────────────────────────────────────────────────────────

  const persistIdentity = useCallback((newIdentity) => {
    setIdentity(newIdentity);
    if (newIdentity) {
      // Only persist safe fields — never the keypair
      const safe = {
        encryptedMnemonic: newIdentity.encryptedMnemonic,
        address: newIdentity.address,
        username: newIdentity.username || null,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // ── Generate new identity ─────────────────────────────────────────────────

  /**
   * Generate a new Ed25519 identity.
   * Returns { mnemonic, address } — caller must show mnemonic to user once.
   * The password is used to encrypt the mnemonic for localStorage.
   */
  // Pending identity — generated but not yet confirmed by user (mnemonic not yet saved)
  const pendingRef = useRef(null);

  const generateIdentity = useCallback(async (password) => {
    if (!password || password.length < 4) {
      throw new Error('Password must be at least 4 characters');
    }

    const mnemonic = generateMnemonic();
    const kp = keypairFromMnemonic(mnemonic);
    const addr = getAddress(kp);
    const encrypted = await encryptMnemonic(mnemonic, password);

    // DON'T persist yet — wait for user to confirm they saved the mnemonic
    pendingRef.current = { kp, encrypted, addr };

    return { mnemonic, address: addr };
  }, []);

  /**
   * Called after user confirms they saved the mnemonic.
   * Completes the identity setup: persists to localStorage, sets unlocked.
   */
  const confirmMnemonicSaved = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;

    _setGlobalUnlocked(true, pending.kp);

    const newIdentity = {
      encryptedMnemonic: pending.encrypted,
      address: pending.addr,
      username: null,
    };
    persistIdentity(newIdentity);
    pendingRef.current = null;
  }, [persistIdentity]);

  // ── Unlock existing identity ──────────────────────────────────────────────

  /**
   * Decrypt the stored mnemonic with the user's password, derive keypair.
   * Throws on wrong password.
   */
  const unlockIdentity = useCallback(async (password) => {
    if (!identity?.encryptedMnemonic) {
      throw new Error('No identity to unlock');
    }
    const mnemonic = await decryptMnemonic(identity.encryptedMnemonic, password);
    const kp = keypairFromMnemonic(mnemonic);
    const addr = getAddress(kp);

    // Verify the derived address matches what we stored
    if (addr !== identity.address) {
      throw new Error('Derived address mismatch — data may be corrupted');
    }

    _setGlobalUnlocked(true, kp);
    return true;
  }, [identity]);

  // ── Lock (clear keypair from memory) ──────────────────────────────────────

  const lockIdentity = useCallback(() => {
    _setGlobalUnlocked(false, null);
  }, []);

  // ── Register username on-chain ────────────────────────────────────────────

  /**
   * Build a TX calling register() on the Move smart contract.
   * The username is stored in the gzipped data payload.
   */
  const registerUsername = useCallback(async (username) => {
    if (!keypairRef.current) throw new Error('Identity not unlocked');
    if (!forumConfig?.packageId || !forumConfig?.registryId) {
      throw new Error('Forum not configured — contract not deployed');
    }

    const entityId = identity.address;
    const data = await gzipCompress({
      username,
      address: identity.address,
      registeredAt: Date.now(),
    });

    const tx = new Transaction();
    tx.moveCall({
      target: `${forumConfig.packageId}::forum::register`,
      arguments: [
        tx.object(forumConfig.registryId),
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(entityId))),
        tx.pure.vector('u8', Array.from(data)),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
    tx.setGasBudget(50_000_000);

    const txId = addTransaction(`Registrazione username "${username}"`, 'REGISTER');
    try {
      updateTransaction(txId, { status: 'submitted' });
      const result = await signAndExecuteTransaction(keypairRef.current, tx);

      if (result.effects?.status?.status !== 'success') {
        const errMsg = result.effects?.status?.error || 'Registration failed on-chain';
        failTransaction(txId, errMsg);
        throw new Error(errMsg);
      }

      completeTransaction(txId, result.digest);
      const updated = { ...identity, username };
      persistIdentity(updated);
      return updated;
    } catch (err) {
      if (getTransactionStatus(txId) !== 'failed') failTransaction(txId, err);
      throw err;
    }
  }, [identity, forumConfig, persistIdentity]);

  // ── Sign and send a Transaction directly on-chain ──────────────────────────

  /**
   * Sign a pre-built Transaction with the user's keypair and execute on IOTA.
   * Use this from useWallet or components that build Move TX directly.
   */
  const signAndSendTx = useCallback(async (transactionBlock) => {
    if (!keypairRef.current) throw new Error('Identity not unlocked');
    return signAndExecuteTransaction(keypairRef.current, transactionBlock);
  }, []);

  // ── Legacy HTTP signAndSend (backward compat for existing components) ─────

  /**
   * LEGACY: Sign a payload and send to a backend API endpoint.
   * Adds authorId (address), nonce, createdAt, and a dummy signature header.
   * This bridges old components until they are migrated to direct TX signing.
   *
   * @param {string} url - API endpoint
   * @param {string} method - HTTP method
   * @param {object} data - Payload
   */
  const signAndSend = useCallback(async (url, method, data = {}) => {
    if (!identity?.address) throw new Error('No identity');
    if (!keypairRef.current) throw new Error('Identity not unlocked — cannot sign');

    const payload = {
      ...data,
      authorId: identity.address,
      nonce: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    // Sign the payload with Ed25519 keypair for backend verification
    const message = JSON.stringify(payload);
    const msgBytes = new TextEncoder().encode(message);
    const { signature } = await keypairRef.current.signPersonalMessage(msgBytes);
    const publicKey = keypairRef.current.getPublicKey().toBase64();

    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Public-Key': publicKey,
      },
      body: JSON.stringify(payload),
    });
  }, [identity?.address]);

  // ── Post event helper (forum actions) ─────────────────────────────────────

  /**
   * Build and execute a post_event / mod_post_event / admin_post_event TX.
   * Handles gzip compression and Move function routing.
   */
  const TAG_LABELS = {
    FORUM_THREAD: 'Nuovo thread',
    FORUM_POST: 'Nuovo post',
    FORUM_VOTE: 'Voto',
    FORUM_CATEGORY: 'Categoria',
    FORUM_MODERATION: 'Moderazione',
    FORUM_ROLE: 'Ruolo utente',
    FORUM_CONFIG: 'Configurazione',
    FORUM_USER: 'Profilo utente',
    FORUM_DM: 'Messaggio diretto',
  };

  const postEvent = useCallback(async (tag, entityId, dataObject, version = 1) => {
    if (!keypairRef.current) throw new Error('Identity not unlocked');
    if (!forumConfig?.packageId || !forumConfig?.forumObjectId || !forumConfig?.registryId) {
      throw new Error('Forum not configured');
    }

    const txLabel = TAG_LABELS[tag] || tag;
    const txId = addTransaction(txLabel, tag);

    try {
      const compressed = await gzipCompress(dataObject);

      const ADMIN_TAGS = ['FORUM_ROLE', 'FORUM_CONFIG'];
      const MOD_TAGS = ['FORUM_MODERATION', 'FORUM_CATEGORY'];

      const tx = new Transaction();
      const commonArgs = [
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(tag))),
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(entityId))),
        tx.pure.vector('u8', Array.from(compressed)),
        tx.pure.u64(version),
        tx.object(CLOCK_OBJECT_ID),
      ];

      let target;
      if (ADMIN_TAGS.includes(tag)) {
        target = `${forumConfig.packageId}::forum::admin_post_event`;
      } else if (MOD_TAGS.includes(tag)) {
        target = `${forumConfig.packageId}::forum::mod_post_event`;
      } else {
        target = `${forumConfig.packageId}::forum::post_event`;
      }

      // post_event, mod_post_event, admin_post_event all need Forum + UserRegistry
      tx.moveCall({
        target,
        arguments: [tx.object(forumConfig.forumObjectId), tx.object(forumConfig.registryId), ...commonArgs],
      });
      tx.setGasBudget(50_000_000);

      updateTransaction(txId, { status: 'submitted' });
      const result = await signAndExecuteTransaction(keypairRef.current, tx);

      if (result.effects?.status?.status !== 'success') {
        const errMsg = result.effects?.status?.error || 'Transaction failed';
        failTransaction(txId, errMsg);
        throw new Error(errMsg);
      }

      completeTransaction(txId, result.digest);
      return result;
    } catch (err) {
      if (getTransactionStatus(txId) !== 'failed') failTransaction(txId, err);
      throw err;
    }
  }, [forumConfig]);

  // ── Export mnemonic (requires password) ───────────────────────────────────

  const exportMnemonic = useCallback(async (password) => {
    if (!identity?.encryptedMnemonic) throw new Error('No identity');
    return decryptMnemonic(identity.encryptedMnemonic, password);
  }, [identity]);

  // ── Import from mnemonic ──────────────────────────────────────────────────

  const importIdentity = useCallback(async (mnemonic, password) => {
    if (!isValidMnemonic(mnemonic)) {
      throw new Error('Invalid BIP39 mnemonic');
    }
    if (!password || password.length < 4) {
      throw new Error('Password must be at least 4 characters');
    }

    const kp = keypairFromMnemonic(mnemonic);
    const addr = getAddress(kp);
    const encrypted = await encryptMnemonic(mnemonic, password);

    _setGlobalUnlocked(true, kp);

    // Try to find existing username for this address
    let username = null;
    try {
      const userInfo = await api.getUser(addr);
      if (userInfo?.user?.username) {
        username = userInfo.user.username;
      }
    } catch { /* new user */ }

    const newIdentity = {
      encryptedMnemonic: encrypted,
      address: addr,
      username,
    };
    persistIdentity(newIdentity);
    return newIdentity;
  }, [persistIdentity]);

  // ── Change password ───────────────────────────────────────────────────────

  const changePassword = useCallback(async (oldPassword, newPassword) => {
    if (!identity?.encryptedMnemonic) throw new Error('No identity');
    if (!newPassword || newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters');
    }

    const mnemonic = await decryptMnemonic(identity.encryptedMnemonic, oldPassword);
    const encrypted = await encryptMnemonic(mnemonic, newPassword);

    const updated = { ...identity, encryptedMnemonic: encrypted };
    persistIdentity(updated);
    return true;
  }, [identity, persistIdentity]);

  // ── Clear identity ────────────────────────────────────────────────────────

  const clearIdentity = useCallback(() => {
    _setGlobalUnlocked(false, null);
    persistIdentity(null);
  }, [persistIdentity]);

  // ── Get balance ───────────────────────────────────────────────────────────

  const getBalance = useCallback(async () => {
    if (!identity?.address) return null;
    try {
      const client = getClient();
      const balance = await client.getBalance({ owner: identity.address });
      return balance;
    } catch {
      return null;
    }
  }, [identity?.address]);

  // Build a backward-compatible identity object that includes userId alias
  const compatIdentity = identity ? {
    ...identity,
    userId: identity.address,  // Legacy alias: components use identity.userId
  } : null;

  return {
    // State
    identity: compatIdentity,
    unlocked,
    loading,
    forumConfig,
    keypair: keypairRef.current,

    // Actions — new
    generateIdentity,
    confirmMnemonicSaved,
    unlockIdentity,
    lockIdentity,
    registerUsername,
    signAndSendTx,       // Direct on-chain TX signing
    postEvent,           // Build + sign + execute a forum event TX
    exportMnemonic,
    importIdentity,
    changePassword,
    clearIdentity,
    getBalance,

    // Actions — legacy compat (HTTP-based, for existing components)
    signAndSend,         // Legacy: signAndSend(url, method, data)
    exportIdentity: () => {}, // No-op stub (old JSON export removed)
  };
}
