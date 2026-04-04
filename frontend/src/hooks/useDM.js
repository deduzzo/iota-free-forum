import { useState, useCallback, useEffect, useRef } from 'react';
import { useIdentity } from './useIdentity';
import { useRealtimeUpdate } from './useWebSocket';
import { api } from '../api/endpoints';
import {
  ed25519ToX25519Private,
  ed25519ToX25519Public,
  deriveSharedSecret,
  encryptDM,
  decryptDM,
  getKeypairBytes,
} from '../api/crypto';

/**
 * Hook for end-to-end encrypted direct messages.
 *
 * Messages are encrypted with X25519 (ECDH) + AES-256-GCM.
 * The server never sees plaintext — only ciphertext is stored.
 */
export function useDM() {
  const { identity, keypair, postEvent, unlocked } = useIdentity();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Cache of shared secrets per partner address
  const secretsCache = useRef(new Map());

  const userId = identity?.address;

  // ── Derive shared secret for a partner ──────────────────────────────

  const getSharedSecret = useCallback(async (theirPublicKeyHex) => {
    if (!keypair || !theirPublicKeyHex) return null;

    const cacheKey = theirPublicKeyHex;
    if (secretsCache.current.has(cacheKey)) {
      return secretsCache.current.get(cacheKey);
    }

    const { privateKey } = getKeypairBytes(keypair);
    const myX25519Priv = ed25519ToX25519Private(privateKey);

    // Convert hex public key to bytes if needed
    let theirPubBytes;
    if (typeof theirPublicKeyHex === 'string') {
      const clean = theirPublicKeyHex.startsWith('0x')
        ? theirPublicKeyHex.slice(2)
        : theirPublicKeyHex;
      theirPubBytes = new Uint8Array(
        clean.match(/.{1,2}/g).map((b) => parseInt(b, 16))
      );
    } else {
      theirPubBytes = theirPublicKeyHex;
    }

    const theirX25519Pub = ed25519ToX25519Public(theirPubBytes);
    const secret = await deriveSharedSecret(myX25519Priv, theirX25519Pub);
    secretsCache.current.set(cacheKey, secret);
    return secret;
  }, [keypair]);

  // ── Fetch conversations ─────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await api.getDMConversations(userId);
      if (res.success) {
        setConversations(res.conversations || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  // ── Fetch messages for a conversation ───────────────────────────────

  const fetchMessages = useCallback(async (otherUserId, page = 1) => {
    if (!userId || !otherUserId) return;
    setLoading(true);
    try {
      const res = await api.getDMMessages(userId, otherUserId, page);
      if (res.success) {
        setMessages(res.messages || []);
        return res;
      }
    } catch { /* ignore */ }
    setLoading(false);
    return null;
  }, [userId]);

  // ── Decrypt a single message ────────────────────────────────────────

  const decryptMessage = useCallback(async (msg, theirPublicKey) => {
    if (!msg?.encryptedContent || !msg?.iv || !theirPublicKey) {
      return { ...msg, decryptedContent: null, decryptError: 'Missing data' };
    }
    try {
      const secret = await getSharedSecret(theirPublicKey);
      if (!secret) return { ...msg, decryptedContent: null, decryptError: 'No keypair' };

      const plaintext = await decryptDM(msg.encryptedContent, msg.iv, secret);
      return { ...msg, decryptedContent: plaintext, decryptError: null };
    } catch (err) {
      return { ...msg, decryptedContent: null, decryptError: err.message };
    }
  }, [getSharedSecret]);

  // ── Decrypt all messages in a conversation ──────────────────────────

  const decryptMessages = useCallback(async (msgs, theirPublicKey) => {
    if (!msgs?.length || !theirPublicKey) return msgs || [];
    return Promise.all(msgs.map((m) => decryptMessage(m, theirPublicKey)));
  }, [decryptMessage]);

  // ── Send a DM ───────────────────────────────────────────────────────

  const sendDM = useCallback(async (toUserId, plaintext, theirPublicKey) => {
    if (!userId || !keypair || !toUserId || !plaintext || !theirPublicKey) {
      throw new Error('Missing required parameters for DM');
    }

    setSending(true);
    try {
      const secret = await getSharedSecret(theirPublicKey);
      if (!secret) throw new Error('Cannot derive shared secret');

      const { ciphertext, iv } = await encryptDM(plaintext, secret);

      // Get our public key hex for the recipient to use
      const { publicKey } = getKeypairBytes(keypair);
      const pubKeyHex = Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join('');

      const dmId = `DM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Post on-chain via post_event with tag FORUM_DM
      await postEvent('FORUM_DM', dmId, {
        id: dmId,
        toUserId,
        encryptedContent: ciphertext,
        iv,
        ephemeralPublicKey: pubKeyHex,
        createdAt: new Date().toISOString(),
      });

      return { success: true, id: dmId };
    } finally {
      setSending(false);
    }
  }, [userId, keypair, postEvent, getSharedSecret]);

  // ── Fetch unread count ──────────────────────────────────────────────

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api.getDMUnreadCount(userId);
      if (res.success) {
        setUnreadCount(res.count || 0);
      }
    } catch { /* ignore */ }
  }, [userId]);

  // Auto-fetch unread count on mount and identity change
  useEffect(() => {
    if (userId && unlocked) fetchUnreadCount();
  }, [userId, unlocked, fetchUnreadCount]);

  // ── Real-time updates ───────────────────────────────────────────────

  useRealtimeUpdate(
    useCallback((data) => {
      if (data.entity === 'dm') {
        fetchUnreadCount();
        // If currently viewing conversations, refresh them
        fetchConversations();
      }
    }, [fetchUnreadCount, fetchConversations]),
    ['dm']
  );

  return {
    conversations,
    messages,
    loading,
    sending,
    unreadCount,
    fetchConversations,
    fetchMessages,
    decryptMessage,
    decryptMessages,
    sendDM,
    fetchUnreadCount,
    getSharedSecret,
  };
}
