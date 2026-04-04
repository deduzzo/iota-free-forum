import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, MessageSquare, AtSign, Coins, Shield, Check, CheckCheck } from 'lucide-react';
import { api } from '../api/endpoints';
import { useIdentity } from '../hooks/useIdentity';
import { useNotificationListener } from '../hooks/useWebSocket';
import { useTranslation } from 'react-i18next';

const ICON_MAP = {
  reply: MessageSquare,
  mention: AtSign,
  tip: Coins,
  escrow: Shield,
  dm: MessageSquare,
  follow: Bell,
};

const COLOR_MAP = {
  reply: 'var(--color-primary)',
  mention: 'var(--color-warning)',
  tip: 'var(--color-success)',
  escrow: '#a855f7',
  dm: 'var(--color-primary)',
  follow: 'var(--color-primary)',
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  return `${Math.floor(diff / 86400_000)}d`;
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const { identity, getAuthHeaders, unlocked } = useIdentity();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const userId = identity?.userId;

  // Fetch unread count
  const fetchUnread = useCallback(async () => {
    if (!userId || !unlocked) return;
    try {
      const headers = await getAuthHeaders();
      const res = await api.getUnreadCount(userId, headers);
      if (res.success) setUnreadCount(res.unreadCount);
    } catch { /* ignore */ }
  }, [userId, unlocked, getAuthHeaders]);

  // Fetch notifications when dropdown opens
  const fetchNotifications = useCallback(async () => {
    if (!userId || !unlocked) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await api.getNotifications(userId, headers, 1);
      if (res.success) setNotifications(res.notifications || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId, unlocked, getAuthHeaders]);

  // Poll unread count
  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Listen for WebSocket newNotification events
  useNotificationListener(useCallback((data) => {
    if (!userId) return;
    if (data?.userId === userId || data?.notification?.userId === userId) {
      setUnreadCount((c) => c + 1);
      if (open) fetchNotifications();
    }
  }, [userId, open, fetchNotifications]));

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleOpen() {
    setOpen((o) => {
      if (!o) fetchNotifications();
      return !o;
    });
  }

  async function handleMarkRead(notifId) {
    try {
      const headers = await getAuthHeaders();
      await api.markNotificationRead(notifId, headers);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: 1 } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  }

  async function handleMarkAllRead() {
    if (!userId) return;
    try {
      const headers = await getAuthHeaders();
      await api.markAllNotificationsRead(userId, headers);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }

  function handleClick(notif) {
    if (!notif.read) handleMarkRead(notif.id);
    setOpen(false);
    // Navigate based on entity
    if (notif.entityId) {
      if (notif.type === 'escrow') {
        navigate('/escrow');
      } else {
        navigate(`/t/${notif.entityId}`);
      }
    }
  }

  if (!userId) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleOpen}
        className="relative p-2 rounded-xl transition-colors cursor-pointer"
        style={{
          color: open ? 'var(--color-primary)' : 'var(--color-text-muted)',
          background: open ? 'rgba(0,240,255,0.1)' : 'transparent',
        }}
        aria-label={t('notifications.title')}
      >
        <Bell size={20} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1"
              style={{
                background: 'var(--color-danger)',
                color: '#fff',
                boxShadow: '0 0 8px rgba(255,68,68,0.5)',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border shadow-lg overflow-hidden z-50"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                {t('notifications.title')}
              </h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <CheckCheck size={12} />
                    {t('notifications.markAllRead')}
                  </button>
                )}
              </div>
            </div>

            {/* Notification list */}
            <div className="max-h-80 overflow-y-auto">
              {loading && notifications.length === 0 && (
                <div className="p-6 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('notifications.loading')}
                </div>
              )}

              {!loading && notifications.length === 0 && (
                <div className="p-6 text-center">
                  <Bell size={32} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {t('notifications.empty')}
                  </p>
                </div>
              )}

              {notifications.map((notif) => {
                const Icon = ICON_MAP[notif.type] || Bell;
                const iconColor = COLOR_MAP[notif.type] || 'var(--color-primary)';
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => handleClick(notif)}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/5 border-b"
                    style={{
                      borderColor: 'rgba(255,255,255,0.05)',
                      background: notif.read ? 'transparent' : 'rgba(0,240,255,0.03)',
                    }}
                  >
                    <div
                      className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: `${iconColor}15`,
                        color: iconColor,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>
                        {notif.fromUsername && (
                          <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                            {notif.fromUsername}{' '}
                          </span>
                        )}
                        {notif.message}
                      </p>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {formatTimeAgo(notif.createdAt)}
                      </span>
                    </div>
                    {!notif.read && (
                      <div
                        className="w-2 h-2 rounded-full mt-2 shrink-0"
                        style={{ background: 'var(--color-primary)', boxShadow: '0 0 6px var(--color-primary)' }}
                      />
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t px-4 py-2" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  onClick={() => { setOpen(false); navigate('/notifications'); }}
                  className="w-full text-center text-xs py-1 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {t('notifications.viewAll')}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
