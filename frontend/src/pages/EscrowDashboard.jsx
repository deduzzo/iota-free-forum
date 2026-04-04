import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, X, Filter, TrendingUp,
  CheckCircle, AlertTriangle, Clock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { useRealtimeUpdate } from '../hooks/useWebSocket';
import { useIdentity } from '../hooks/useIdentity';
import { useWallet } from '../hooks/useWallet';
import EscrowCard from '../components/EscrowCard';
import LoadingSpinner from '../components/LoadingSpinner';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const STATUS_TABS = [
  { key: 'active', icon: Clock, label: 'escrowDashboard.active' },
  { key: 'completed', icon: CheckCircle, label: 'escrowDashboard.completed' },
  { key: 'disputed', icon: AlertTriangle, label: 'escrowDashboard.disputed' },
];

const ROLE_FILTERS = ['all', 'buyer', 'seller', 'arbitrator'];

export default function EscrowDashboard() {
  const { t } = useTranslation();
  const { identity, signAndSend } = useIdentity();
  const { claimExpiredEscrow } = useWallet();
  const [activeTab, setActiveTab] = useState('active');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, loading, error, reload } = useApi(
    () => identity?.userId
      ? fetch(`/api/v1/escrows?userId=${identity.userId}`).then((r) => r.json())
      : Promise.resolve(null),
    [identity?.userId],
  );

  // Real-time updates
  useRealtimeUpdate(
    useCallback(
      (wsData) => {
        if (wsData.entity === 'escrow' || wsData.entity === 'rating') {
          reload();
        }
      },
      [reload],
    ),
    ['escrow', 'rating'],
  );

  const escrows = data?.escrows || [];
  const stats = data?.stats || { totalTrades: 0, successRate: 0, totalVolume: 0 };

  // Filter by status
  const statusFiltered = escrows.filter((e) => {
    if (activeTab === 'active') return ['created', 'funded', 'delivered'].includes(e.status);
    if (activeTab === 'completed') return e.status === 'resolved';
    if (activeTab === 'disputed') return e.status === 'disputed';
    return true;
  });

  // Filter by role
  const filtered = statusFiltered.filter((e) => {
    if (roleFilter === 'all') return true;
    const userId = identity?.userId;
    if (roleFilter === 'buyer') return (e.buyer?.id || e.buyer) === userId;
    if (roleFilter === 'seller') return (e.seller?.id || e.seller) === userId;
    if (roleFilter === 'arbitrator') return (e.arbitrator?.id || e.arbitrator) === userId;
    return true;
  });

  // Actions
  async function handleMarkDelivered(escrowId) {
    try {
      await signAndSend(`/api/v1/escrow/${escrowId}/deliver`, 'POST', {});
      reload();
    } catch (err) {
      console.error('[Escrow] Mark delivered failed:', err);
    }
  }

  async function handleConfirm(escrowId) {
    try {
      await signAndSend(`/api/v1/escrow/${escrowId}/confirm`, 'POST', {});
      reload();
    } catch (err) {
      console.error('[Escrow] Confirm failed:', err);
    }
  }

  async function handleDispute(escrowId) {
    try {
      await signAndSend(`/api/v1/escrow/${escrowId}/dispute`, 'POST', {});
      reload();
    } catch (err) {
      console.error('[Escrow] Dispute failed:', err);
    }
  }

  async function handleVoteRelease(escrowId) {
    try {
      await signAndSend(`/api/v1/escrow/${escrowId}/vote-release`, 'POST', {});
      reload();
    } catch (err) {
      console.error('[Escrow] Vote release failed:', err);
    }
  }

  async function handleVoteRefund(escrowId) {
    try {
      await signAndSend(`/api/v1/escrow/${escrowId}/vote-refund`, 'POST', {});
      reload();
    } catch (err) {
      console.error('[Escrow] Vote refund failed:', err);
    }
  }

  async function handleRate(escrowId, ratingData) {
    try {
      await signAndSend(`/api/v1/escrow/${escrowId}/rate`, 'POST', ratingData);
      reload();
    } catch (err) {
      console.error('[Escrow] Rate failed:', err);
    }
  }

  async function handleClaimExpired(escrowObjectId) {
    try {
      await claimExpiredEscrow(escrowObjectId);
      reload();
    } catch (err) {
      console.error('[Escrow] Claim expired failed:', err);
    }
  }

  if (!identity) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Shield size={48} style={{ color: 'var(--color-text-muted)' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>{t('escrowDashboard.loginRequired')}</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner size={32} className="min-h-[40vh]" />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl md:text-3xl font-bold flex items-center gap-3 neon-text"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          <Shield size={28} style={{ color: 'var(--color-primary)' }} />
          {t('escrowDashboard.title')}
        </motion.h1>

        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
        >
          <Plus size={16} />
          {t('escrowDashboard.createNew')}
        </motion.button>
      </div>

      {/* Stats summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-3 gap-4 mb-6"
      >
        {[
          { label: t('escrowDashboard.totalTrades'), value: stats.totalTrades, icon: TrendingUp, color: 'var(--color-primary)' },
          { label: t('escrowDashboard.successRate'), value: `${stats.successRate || 0}%`, icon: CheckCircle, color: 'var(--color-success)' },
          { label: t('escrowDashboard.totalVolume'), value: `${(stats.totalVolume || 0).toFixed(1)} IOTA`, icon: Shield, color: 'var(--color-warning)' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card text-center">
            <stat.icon size={18} className="mx-auto mb-1" style={{ color: stat.color }} />
            <p className="text-lg font-bold font-mono" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
        {STATUS_TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.key;
          const count = escrows.filter((e) => {
            if (tab.key === 'active') return ['created', 'funded', 'delivered'].includes(e.status);
            if (tab.key === 'completed') return e.status === 'resolved';
            if (tab.key === 'disputed') return e.status === 'disputed';
            return true;
          }).length;
          return (
            <motion.button
              key={tab.key}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: isActive ? 'var(--color-primary)' : 'transparent',
                color: isActive ? 'var(--color-background)' : 'var(--color-text-muted)',
              }}
            >
              <TabIcon size={16} />
              <span className="hidden sm:inline">{t(tab.label)}</span>
              {count > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0 rounded-full"
                  style={{
                    backgroundColor: isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
                  }}
                >
                  {count}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Role filter */}
      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} style={{ color: 'var(--color-text-muted)' }} />
        {ROLE_FILTERS.map((role) => (
          <button
            key={role}
            onClick={() => setRoleFilter(role)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: roleFilter === role ? 'rgba(0,240,255,0.15)' : 'transparent',
              color: roleFilter === role ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: `1px solid ${roleFilter === role ? 'var(--color-primary)' : 'var(--color-border)'}`,
            }}
          >
            {t(`escrowDashboard.role.${role}`)}
          </button>
        ))}
      </div>

      {/* Escrow list */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab + roleFilter}
          variants={container}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0 }}
          className="space-y-3"
        >
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <Shield size={40} style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {t('escrowDashboard.noEscrows')}
              </p>
            </motion.div>
          ) : (
            filtered.map((escrow) => (
              <motion.div key={escrow.id} variants={item}>
                <EscrowCard
                  escrow={escrow}
                  currentUserId={identity?.userId}
                  onMarkDelivered={handleMarkDelivered}
                  onConfirm={handleConfirm}
                  onDispute={handleDispute}
                  onVoteRelease={handleVoteRelease}
                  onVoteRefund={handleVoteRefund}
                  onClaimExpired={handleClaimExpired}
                  onRate={handleRate}
                />
              </motion.div>
            ))
          )}
        </motion.div>
      </AnimatePresence>

      {/* Create Escrow Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateEscrowModal
            onClose={() => setShowCreateModal(false)}
            onCreated={() => { setShowCreateModal(false); reload(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateEscrowModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const { signAndSend } = useIdentity();
  const [sellerAddress, setSellerAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!sellerAddress.trim() || !amount || parseFloat(amount) <= 0) return;
    setSubmitting(true);
    try {
      await signAndSend('/api/v1/escrow', 'POST', {
        seller: sellerAddress.trim(),
        amount: parseFloat(amount),
        description: description.trim(),
      });
      onCreated();
    } catch (err) {
      console.error('[Escrow] Create failed:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        className="relative p-6 rounded-xl max-w-lg mx-4 w-full border"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        style={{
          borderRadius: 'var(--border-radius)',
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-lg font-bold flex items-center gap-2"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            <Shield size={20} style={{ color: 'var(--color-primary)' }} />
            {t('escrowDashboard.createEscrow')}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X size={18} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('escrowDashboard.sellerAddress')}
            </label>
            <input
              type="text"
              value={sellerAddress}
              onChange={(e) => setSellerAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('escrowDashboard.amount')}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1.0"
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('escrowDashboard.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('escrowDashboard.descriptionPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none text-sm resize-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm border transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              {t('common.cancel')}
            </button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={submitting || !sellerAddress.trim() || !amount || parseFloat(amount) <= 0}
              className="btn-primary px-5 py-2 rounded-lg text-sm disabled:opacity-40"
            >
              {submitting ? t('escrowDashboard.creating') : t('escrowDashboard.create')}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
