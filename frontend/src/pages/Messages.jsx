import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, Lock, ArrowLeft, Search, User, Shield,
} from 'lucide-react';
import { useIdentity } from '../hooks/useIdentity';
import { useDM } from '../hooks/useDM';
import { api } from '../api/endpoints';
import { useTranslation } from 'react-i18next';

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function UserAvatar({ avatar, username, size = 40 }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={username || ''}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(120,80,255,0.2))',
        color: 'var(--color-primary)',
      }}
    >
      <User size={size * 0.5} />
    </div>
  );
}

export default function Messages() {
  const { t } = useTranslation();
  const { identity, unlocked } = useIdentity();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations,
    loading,
    sending,
    fetchConversations,
    fetchMessages,
    decryptMessages,
    sendDM,
  } = useDM();

  const [selectedPartner, setSelectedPartner] = useState(searchParams.get('to') || null);
  const [partnerInfo, setPartnerInfo] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [decryptedMessages, setDecryptedMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(!!searchParams.get('to'));
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const userId = identity?.address;

  // ── Fetch conversations on mount ────────────────────────────────────
  useEffect(() => {
    if (userId && unlocked) fetchConversations();
  }, [userId, unlocked, fetchConversations]);

  // ── Load partner info & messages when partner changes ───────────────
  useEffect(() => {
    if (!selectedPartner || !userId) return;

    setChatLoading(true);
    setDecryptedMessages([]);

    // Fetch partner user info
    api.getUser(selectedPartner).then((res) => {
      if (res?.user) setPartnerInfo(res.user);
    }).catch(() => {});

    // Fetch messages
    fetchMessages(selectedPartner).then(async (res) => {
      if (!res?.messages) {
        setChatLoading(false);
        return;
      }
      setChatMessages(res.messages);

      // Try to decrypt using partner's publicKey
      if (partnerInfo?.publicKey || res.messages[0]?.ephemeralPublicKey) {
        const pubKey = partnerInfo?.publicKey ||
          res.messages.find(m => m.fromUserId !== userId)?.ephemeralPublicKey ||
          res.messages.find(m => m.fromUserId === userId)?.ephemeralPublicKey;
        if (pubKey) {
          const decrypted = await decryptMessages(res.messages, pubKey);
          setDecryptedMessages(decrypted);
        }
      }
      setChatLoading(false);
    });
  }, [selectedPartner, userId]);

  // Re-decrypt when partnerInfo loads
  useEffect(() => {
    if (!partnerInfo?.publicKey || !chatMessages.length) return;
    decryptMessages(chatMessages, partnerInfo.publicKey).then(setDecryptedMessages);
  }, [partnerInfo?.publicKey, chatMessages, decryptMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [decryptedMessages]);

  // Focus input when chat opens
  useEffect(() => {
    if (selectedPartner) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [selectedPartner]);

  // ── Send handler ────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !selectedPartner || !partnerInfo?.publicKey || sending) return;

    const text = messageText.trim();
    setMessageText('');

    try {
      await sendDM(selectedPartner, text, partnerInfo.publicKey);
      // Refresh messages
      const res = await fetchMessages(selectedPartner);
      if (res?.messages) {
        setChatMessages(res.messages);
        const decrypted = await decryptMessages(res.messages, partnerInfo.publicKey);
        setDecryptedMessages(decrypted);
      }
      fetchConversations();
    } catch (err) {
      console.error('[DM] Send failed:', err);
      setMessageText(text); // Restore on failure
    }
  }, [messageText, selectedPartner, partnerInfo, sending, sendDM, fetchMessages, decryptMessages, fetchConversations]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectPartner = (partnerId) => {
    setSelectedPartner(partnerId);
    setSearchParams({ to: partnerId });
    setMobileShowChat(true);
  };

  const goBack = () => {
    setMobileShowChat(false);
    setSelectedPartner(null);
    setSearchParams({});
  };

  // ── Filter conversations ────────────────────────────────────────────
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.partner?.toLowerCase().includes(q) ||
      c.partnerUsername?.toLowerCase().includes(q)
    );
  });

  // ── Guard ───────────────────────────────────────────────────────────
  if (!identity) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <div className="glass-card p-12 text-center">
          <Lock size={48} className="mx-auto mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-lg font-medium mb-1" style={{ color: 'var(--color-text)' }}>
            {t('dm.loginRequired', 'Sign in to use messages')}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('dm.loginRequiredDesc', 'Create or unlock your wallet to send encrypted messages.')}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare size={24} style={{ color: 'var(--color-primary)' }} />
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text)' }}
        >
          {t('dm.inbox', 'Messages')}
        </h1>
        <div className="flex items-center gap-1.5 ml-auto px-2.5 py-1 rounded-lg text-[10px] font-medium"
          style={{ background: 'rgba(0,240,255,0.08)', color: 'var(--color-primary)' }}>
          <Shield size={12} />
          {t('dm.encrypted', 'End-to-End Encrypted')}
        </div>
      </div>

      {/* Main layout: sidebar + chat */}
      <div
        className="rounded-2xl overflow-hidden flex"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          height: 'calc(100vh - 200px)',
          minHeight: 500,
        }}
      >
        {/* ── Conversation List (left panel) ──────────────────────── */}
        <div
          className={`flex flex-col ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}
          style={{
            width: 340,
            minWidth: 280,
            borderRight: '1px solid var(--color-border)',
          }}
        >
          {/* Search bar */}
          <div className="p-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              <Search size={14} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('dm.searchConversations', 'Search conversations...')}
                className="bg-transparent border-none outline-none text-sm flex-1"
                style={{ color: 'var(--color-text)' }}
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading && conversations.length === 0 && (
              <div className="p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {t('dm.loading', 'Loading...')}
              </div>
            )}

            {!loading && filteredConversations.length === 0 && (
              <div className="p-8 text-center">
                <MessageSquare size={32} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('dm.noConversations', 'No conversations yet')}
                </p>
              </div>
            )}

            <AnimatePresence>
              {filteredConversations.map((conv) => (
                <motion.div
                  key={conv.partner}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onClick={() => selectPartner(conv.partner)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-all"
                  style={{
                    background: selectedPartner === conv.partner
                      ? 'rgba(0,240,255,0.06)'
                      : 'transparent',
                    borderLeft: selectedPartner === conv.partner
                      ? '3px solid var(--color-primary)'
                      : '3px solid transparent',
                  }}
                >
                  <UserAvatar
                    avatar={conv.partnerAvatar}
                    username={conv.partnerUsername}
                    size={42}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {conv.partnerShowUsername && conv.partnerUsername
                          ? conv.partnerUsername
                          : `${conv.partner.slice(0, 6)}...${conv.partner.slice(-4)}`}
                      </span>
                      <span className="text-[10px] shrink-0 ml-2" style={{ color: 'var(--color-text-muted)' }}>
                        {formatDate(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                        <Lock size={10} className="inline mr-1" />
                        {t('dm.encryptedMessage', 'Encrypted message')}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ml-2"
                          style={{
                            background: 'var(--color-primary)',
                            color: 'var(--color-background)',
                          }}
                        >
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Chat Area (right panel) ─────────────────────────────── */}
        <div
          className={`flex-1 flex flex-col ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}
        >
          {!selectedPartner ? (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare size={56} className="mx-auto mb-4 opacity-10" style={{ color: 'var(--color-text-muted)' }} />
                <p className="text-lg font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  {t('dm.selectConversation', 'Select a conversation')}
                </p>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                  {t('dm.selectConversationDesc', 'Choose a conversation from the list or start a new one.')}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <button
                  onClick={goBack}
                  className="md:hidden p-1 rounded-lg transition-colors hover:bg-white/5"
                >
                  <ArrowLeft size={20} style={{ color: 'var(--color-text)' }} />
                </button>
                <UserAvatar
                  avatar={partnerInfo?.avatar}
                  username={partnerInfo?.username}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <span
                    className="text-sm font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--color-text)' }}
                    onClick={() => navigate(`/u/${selectedPartner}`)}
                  >
                    {partnerInfo?.showUsername && partnerInfo?.username
                      ? partnerInfo.username
                      : `${selectedPartner.slice(0, 8)}...${selectedPartner.slice(-6)}`}
                  </span>
                  <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    <Lock size={10} />
                    {t('dm.encrypted', 'End-to-End Encrypted')}
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {chatLoading && (
                  <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {t('dm.loading', 'Loading...')}
                  </div>
                )}

                {!chatLoading && decryptedMessages.length === 0 && (
                  <div className="text-center py-12">
                    <Lock size={32} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {t('dm.noMessages', 'No messages yet. Send the first one!')}
                    </p>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {decryptedMessages.map((msg, idx) => {
                    const isMe = msg.fromUserId === userId;
                    return (
                      <motion.div
                        key={msg.id || idx}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                          style={{
                            background: isMe
                              ? 'linear-gradient(135deg, rgba(0,240,255,0.15), rgba(120,80,255,0.15))'
                              : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${isMe ? 'rgba(0,240,255,0.2)' : 'var(--color-border)'}`,
                            color: 'var(--color-text)',
                            borderBottomRightRadius: isMe ? 6 : 18,
                            borderBottomLeftRadius: isMe ? 18 : 6,
                          }}
                        >
                          {msg.decryptedContent ? (
                            <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {msg.decryptedContent}
                            </p>
                          ) : (
                            <p className="italic opacity-60" style={{ color: 'var(--color-text-muted)' }}>
                              {msg.decryptError || t('dm.cannotDecrypt', 'Cannot decrypt')}
                            </p>
                          )}
                          <div
                            className="text-[10px] mt-1"
                            style={{
                              color: 'var(--color-text-muted)',
                              textAlign: isMe ? 'right' : 'left',
                            }}
                          >
                            {formatDate(msg.createdAt)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div
                className="px-4 py-3"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                {!partnerInfo?.publicKey ? (
                  <div
                    className="text-center text-sm py-3 px-4 rounded-xl"
                    style={{ background: 'rgba(255,160,0,0.08)', color: 'var(--color-warning)' }}
                  >
                    {t('dm.noPublicKey', 'This user has not shared their public key yet. They need to register on the forum first.')}
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <div
                      className="flex-1 rounded-xl overflow-hidden"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <textarea
                        ref={inputRef}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('dm.placeholder', 'Write an encrypted message...')}
                        rows={1}
                        className="w-full bg-transparent border-none outline-none px-4 py-3 text-sm resize-none"
                        style={{
                          color: 'var(--color-text)',
                          maxHeight: 120,
                          minHeight: 44,
                        }}
                        onInput={(e) => {
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                        }}
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSend}
                      disabled={!messageText.trim() || sending}
                      className="p-3 rounded-xl transition-all shrink-0"
                      style={{
                        background: messageText.trim() && !sending
                          ? 'linear-gradient(135deg, var(--color-primary), rgba(120,80,255,0.8))'
                          : 'rgba(255,255,255,0.05)',
                        color: messageText.trim() && !sending
                          ? 'var(--color-background)'
                          : 'var(--color-text-muted)',
                        opacity: sending ? 0.5 : 1,
                      }}
                    >
                      <Send size={18} />
                    </motion.button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
