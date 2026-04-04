import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, MessageSquare, AtSign, Coins, Shield, CheckCheck, Filter,
} from 'lucide-react';
import { api } from '../api/endpoints';
import { useIdentity } from '../hooks/useIdentity';
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

const FILTER_TYPES = [
  { key: null, label: 'all' },
  { key: 'reply', label: 'replies' },
  { key: 'mention', label: 'mentions' },
  { key: 'tip', label: 'tips' },
  { key: 'escrow', label: 'escrow' },
];

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleString();
}

export default function Notifications() {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterType, setFilterType] = useState(null);

  const userId = identity?.userId;

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await api.getNotifications(userId, page, filterType);
      if (res.success) {
        setNotifications(res.notifications || []);
        setTotal(res.total || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId, page, filterType]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  async function handleMarkRead(notifId) {
    try {
      await api.markNotificationRead(notifId);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: 1 } : n)));
    } catch { /* ignore */ }
  }

  async function handleMarkAllRead() {
    if (!userId) return;
    try {
      await api.markAllNotificationsRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch { /* ignore */ }
  }

  function handleClick(notif) {
    if (!notif.read) handleMarkRead(notif.id);
    if (notif.entityId) {
      if (notif.type === 'escrow') {
        navigate('/escrow');
      } else {
        navigate(`/t/${notif.entityId}`);
      }
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-bold flex items-center gap-3"
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text)' }}
        >
          <Bell size={24} style={{ color: 'var(--color-primary)' }} />
          {t('notifications.title')}
        </h1>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleMarkAllRead}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs border transition-colors hover:bg-white/5"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
        >
          <CheckCheck size={14} />
          {t('notifications.markAllRead')}
        </motion.button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={14} style={{ color: 'var(--color-text-muted)' }} />
        {FILTER_TYPES.map(({ key, label }) => (
          <button
            key={label}
            onClick={() => { setFilterType(key); setPage(1); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filterType === key ? 'rgba(0,240,255,0.15)' : 'rgba(255,255,255,0.05)',
              color: filterType === key ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: `1px solid ${filterType === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
            }}
          >
            {t(`notifications.filter.${label}`)}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="space-y-2">
        {loading && notifications.length === 0 && (
          <div className="glass-card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
            {t('notifications.loading')}
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="glass-card p-12 text-center">
            <Bell size={48} className="mx-auto mb-4 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-lg font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              {t('notifications.empty')}
            </p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('notifications.emptyDesc')}
            </p>
          </div>
        )}

        <AnimatePresence>
          {notifications.map((notif) => {
            const Icon = ICON_MAP[notif.type] || Bell;
            const iconColor = COLOR_MAP[notif.type] || 'var(--color-primary)';
            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => handleClick(notif)}
                className="glass-card flex items-start gap-4 cursor-pointer transition-all hover:scale-[1.01]"
                style={{
                  borderLeft: `3px solid ${notif.read ? 'var(--color-border)' : iconColor}`,
                  background: notif.read ? undefined : 'rgba(0,240,255,0.02)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${iconColor}15`, color: iconColor }}
                >
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
                    {notif.fromUsername && (
                      <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>
                        {notif.fromUsername}{' '}
                      </span>
                    )}
                    {notif.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {formatDate(notif.createdAt)}
                    </span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: `${iconColor}15`, color: iconColor }}
                    >
                      {t(`notifications.type.${notif.type}`, notif.type)}
                    </span>
                  </div>
                </div>
                {!notif.read && (
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-2 shrink-0"
                    style={{ background: 'var(--color-primary)', boxShadow: '0 0 8px var(--color-primary)' }}
                  />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
            Math.max(0, page - 3),
            Math.min(totalPages, page + 2)
          ).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className="w-8 h-8 rounded-lg text-xs font-medium transition-all"
              style={{
                background: p === page ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                color: p === page ? 'var(--color-background)' : 'var(--color-text-muted)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
