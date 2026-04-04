import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Clock, Users, DollarSign, AlertTriangle, TrendingUp,
  Download, Filter, Search, Lock, ExternalLink, ChevronLeft, ChevronRight,
  RefreshCw, FileText, MessageSquare, Heart, Shield, Star, UserPlus,
  Zap, Hash, Eye,
} from 'lucide-react';
import { useIdentity } from '../hooks/useIdentity';
import { useApi } from '../hooks/useApi';
import { api } from '../api/endpoints';
import { useTranslation } from 'react-i18next';

/* ── Tag config (colors + icons) ──────────────────────────────────── */

const TAG_CONFIG = {
  FORUM_USER:           { color: '#00f0ff', bg: 'rgba(0,240,255,0.12)', icon: UserPlus, label: 'User' },
  FORUM_THREAD:         { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: FileText, label: 'Thread' },
  FORUM_POST:           { color: '#6366f1', bg: 'rgba(99,102,241,0.12)', icon: MessageSquare, label: 'Post' },
  FORUM_VOTE:           { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: Star, label: 'Vote' },
  FORUM_TIP:            { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: Heart, label: 'Tip' },
  FORUM_CATEGORY:       { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Hash, label: 'Category' },
  FORUM_MODERATION:     { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: Shield, label: 'Moderation' },
  FORUM_ROLE:           { color: '#ec4899', bg: 'rgba(236,72,153,0.12)', icon: Shield, label: 'Role' },
  FORUM_CONFIG:         { color: '#14b8a6', bg: 'rgba(20,184,166,0.12)', icon: Zap, label: 'Config' },
  FORUM_SUBSCRIPTION:   { color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: Star, label: 'Subscription' },
  FORUM_PURCHASE:       { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: DollarSign, label: 'Purchase' },
  FORUM_BADGE:          { color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: Star, label: 'Badge' },
  FORUM_ESCROW_CREATED: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: Shield, label: 'Escrow' },
  FORUM_ESCROW_UPDATED: { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', icon: Shield, label: 'Escrow Update' },
  FORUM_RATING:         { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', icon: Star, label: 'Rating' },
  FORUM_REACTION:       { color: '#f472b6', bg: 'rgba(244,114,182,0.12)', icon: Heart, label: 'Reaction' },
  FORUM_DM:             { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', icon: Lock, label: 'DM' },
};

function getTagConfig(tag) {
  return TAG_CONFIG[tag] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: Activity, label: tag };
}

/* ── Stat Card ────────────────────────────────────────────────────── */

function StatCard({ icon: Icon, label, value, subValue, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="glass-card rounded-xl p-5 border relative overflow-hidden"
      style={{ borderColor: `${color}20` }}
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-5" style={{ background: color, filter: 'blur(30px)', transform: 'translate(30%, -30%)' }} />
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl" style={{ background: `${color}15` }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-bold font-mono tracking-tight mb-1" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      {subValue && (
        <div className="text-[10px] mt-1 font-mono" style={{ color: `${color}99` }}>{subValue}</div>
      )}
    </motion.div>
  );
}

/* ── Bar Chart ────────────────────────────────────────────────────── */

function HourlyChart({ txPerHour }) {
  const { t } = useTranslation();
  const [hoveredBar, setHoveredBar] = useState(null);

  // Group by hour, aggregate tags
  const hourMap = {};
  for (const entry of txPerHour || []) {
    if (!hourMap[entry.hour]) hourMap[entry.hour] = {};
    hourMap[entry.hour][entry.tag] = (hourMap[entry.hour][entry.tag] || 0) + entry.count;
  }

  // Fill last 24 hours
  const now = new Date();
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000);
    const key = d.toISOString().slice(0, 13) + ':00:00';
    hours.push({ key, label: d.getHours().toString().padStart(2, '0') + ':00', data: hourMap[key] || {} });
  }

  const maxTotal = Math.max(1, ...hours.map(h => Object.values(h.data).reduce((s, v) => s + v, 0)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-card rounded-xl p-5 border"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
        <TrendingUp size={16} style={{ color: 'var(--color-primary)' }} />
        {t('audit.chart.title', 'Transactions (Last 24h)')}
      </h3>

      <div className="flex items-end gap-1 h-40 relative">
        {hours.map((hour, idx) => {
          const total = Object.values(hour.data).reduce((s, v) => s + v, 0);
          const heightPct = (total / maxTotal) * 100;
          const tags = Object.entries(hour.data).sort((a, b) => b[1] - a[1]);

          return (
            <div
              key={hour.key}
              className="flex-1 relative group cursor-pointer"
              style={{ height: '100%' }}
              onMouseEnter={() => setHoveredBar(idx)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              <div className="absolute bottom-0 left-0 right-0 rounded-t transition-all duration-200"
                style={{ height: `${Math.max(heightPct, total > 0 ? 2 : 0)}%` }}
              >
                {tags.map(([tag], i) => {
                  const cfg = getTagConfig(tag);
                  const pct = (hour.data[tag] / total) * 100;
                  return (
                    <div
                      key={tag}
                      className={i === 0 ? 'rounded-t' : ''}
                      style={{
                        height: `${pct}%`,
                        minHeight: '1px',
                        background: hoveredBar === idx
                          ? cfg.color
                          : `${cfg.color}88`,
                        transition: 'all 0.2s',
                      }}
                    />
                  );
                })}
                {total === 0 && (
                  <div className="w-full h-full rounded-t" style={{ background: 'rgba(255,255,255,0.03)' }} />
                )}
              </div>

              {/* Tooltip */}
              {hoveredBar === idx && total > 0 && (
                <div
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 min-w-[140px] rounded-lg p-2.5 text-[10px] shadow-xl border pointer-events-none"
                  style={{
                    background: 'rgba(10,10,26,0.95)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <div className="font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>{hour.label}</div>
                  {tags.map(([tag, count]) => {
                    const cfg = getTagConfig(tag);
                    return (
                      <div key={tag} className="flex items-center justify-between gap-3 py-0.5">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                          <span style={{ color: 'var(--color-text-muted)' }}>{cfg.label}</span>
                        </span>
                        <span className="font-mono font-bold" style={{ color: cfg.color }}>{count}</span>
                      </div>
                    );
                  })}
                  <div className="border-t mt-1 pt-1 flex justify-between" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>Total</span>
                    <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>{total}</span>
                  </div>
                </div>
              )}

              {/* Hour label */}
              {idx % 3 === 0 && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {hour.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="h-5" /> {/* Spacer for labels */}
    </motion.div>
  );
}

/* ── Tag Badge ────────────────────────────────────────────────────── */

function TagBadge({ tag }) {
  const cfg = getTagConfig(tag);
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}25` }}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

/* ── Transaction Row ──────────────────────────────────────────────── */

function TxRow({ tx, isNew }) {
  const cfg = getTagConfig(tx.tag);
  const time = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '-';
  const shortAuthor = tx.authorId ? `${tx.authorId.slice(0, 8)}...${tx.authorId.slice(-6)}` : '-';

  const explorerUrl = tx.txDigest
    ? `https://explorer.rebased.iota.org/txblock/${tx.txDigest}`
    : null;

  return (
    <motion.tr
      initial={isNew ? { opacity: 0, backgroundColor: `${cfg.color}20` } : { opacity: 1 }}
      animate={{ opacity: 1, backgroundColor: 'transparent' }}
      transition={{ duration: isNew ? 1.5 : 0.3 }}
      className="border-b hover:bg-white/[0.02] transition-colors"
      style={{ borderColor: 'rgba(255,255,255,0.04)' }}
    >
      <td className="py-2.5 px-3 text-[11px] font-mono whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
        {time}
      </td>
      <td className="py-2.5 px-3">
        <TagBadge tag={tx.tag} />
      </td>
      <td className="py-2.5 px-3 text-[11px] font-mono" style={{ color: 'var(--color-text)' }} title={tx.authorId || ''}>
        {shortAuthor}
      </td>
      <td className="py-2.5 px-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {tx.action || '-'}
      </td>
      <td className="py-2.5 px-3 text-[11px] max-w-[200px] truncate" style={{ color: 'var(--color-text-muted)' }}>
        {tx.isEncrypted ? (
          <span className="inline-flex items-center gap-1" style={{ color: '#a78bfa' }}>
            <Lock size={10} /> [encrypted]
          </span>
        ) : (
          <span title={tx.dataPreview || ''}>{tx.dataPreview?.substring(0, 60) || '-'}</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-[11px] font-mono">
        {tx.txDigest ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline transition-colors"
            style={{ color: 'var(--color-primary)' }}
          >
            {tx.txDigest.slice(0, 10)}...
            <ExternalLink size={10} />
          </a>
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>-</span>
        )}
      </td>
    </motion.tr>
  );
}

/* ── Main Page ────────────────────────────────────────────────────── */

export default function AuditDashboard() {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const adminAddress = identity?.userId;

  // Stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Transactions
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [txLoading, setTxLoading] = useState(true);

  // Filters
  const [filterTag, setFilterTag] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(1);

  // New TX tracking
  const [newTxIds, setNewTxIds] = useState(new Set());
  const prevTxIdsRef = useRef(new Set());

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!adminAddress) return;
    try {
      const res = await api.getAuditStats(adminAddress);
      if (res.success) setStats(res.stats);
    } catch (e) { /* ignore */ }
    setStatsLoading(false);
  }, [adminAddress]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    if (!adminAddress) return;
    setTxLoading(true);
    try {
      const res = await api.getAuditTransactions(adminAddress, {
        tag: filterTag,
        authorId: filterAuthor,
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        page,
        limit: 30,
      });
      if (res.success) {
        // Detect new transactions
        const currentIds = new Set(res.transactions.map(tx => tx.id));
        const freshIds = new Set();
        for (const id of currentIds) {
          if (!prevTxIdsRef.current.has(id) && prevTxIdsRef.current.size > 0) {
            freshIds.add(id);
          }
        }
        setNewTxIds(freshIds);
        prevTxIdsRef.current = currentIds;
        // Clear new highlight after 2s
        if (freshIds.size > 0) {
          setTimeout(() => setNewTxIds(new Set()), 2000);
        }

        setTransactions(res.transactions);
        setPagination(res.pagination);
      }
    } catch (e) { /* ignore */ }
    setTxLoading(false);
  }, [adminAddress, filterTag, filterAuthor, filterDateFrom, filterDateTo, page]);

  // Initial load + auto-refresh
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
      if (page === 1) fetchTransactions();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchTransactions, page]);

  // All unique tags for filter dropdown
  const allTags = Object.keys(TAG_CONFIG);

  if (!adminAddress) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass-card rounded-xl p-8 text-center max-w-md">
          <Shield size={48} className="mx-auto mb-4" style={{ color: 'var(--color-danger)' }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            {t('audit.accessDenied', 'Access Denied')}
          </h2>
          <p style={{ color: 'var(--color-text-muted)' }}>
            {t('audit.loginRequired', 'Admin authentication required to access the audit dashboard.')}
          </p>
        </div>
      </div>
    );
  }

  const exportUrl = api.getAuditExportUrl(adminAddress, {
    tag: filterTag, authorId: filterAuthor, dateFrom: filterDateFrom, dateTo: filterDateTo,
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}>
            <Activity size={28} style={{ color: 'var(--color-primary)' }} />
            {t('audit.title', 'Audit Dashboard')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {t('audit.subtitle', 'Real-time transaction monitoring and analytics')}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { fetchStats(); fetchTransactions(); }}
          className="p-2.5 rounded-xl border transition-colors"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          title={t('audit.refresh', 'Refresh')}
        >
          <RefreshCw size={18} />
        </motion.button>
      </motion.div>

      {/* ── Stats Overview ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={Activity} label={t('audit.stats.totalTx', 'Total TX')}
          value={stats?.totalTx ?? '-'} color="#00f0ff" delay={0}
        />
        <StatCard
          icon={Clock} label={t('audit.stats.tx24h', 'TX Today')}
          value={stats?.tx24h ?? '-'} color="#3b82f6" delay={0.05}
        />
        <StatCard
          icon={Users} label={t('audit.stats.activeUsers', 'Active Users')}
          value={stats?.activeUsers ?? '-'} color="#10b981" delay={0.1}
        />
        <StatCard
          icon={DollarSign} label={t('audit.stats.paymentVolume', 'Payment Volume')}
          value={stats ? (stats.paymentVolume.tips + stats.paymentVolume.escrows + stats.paymentVolume.purchases) : '-'}
          subValue={stats ? `Tips: ${stats.paymentVolume.tips} | Escrow: ${stats.paymentVolume.escrows}` : null}
          color="#f59e0b" delay={0.15}
        />
        <StatCard
          icon={AlertTriangle} label={t('audit.stats.dmEncrypted', 'Encrypted (DM)')}
          value={stats?.byType?.find(t => t.tag === 'FORUM_DM')?.count ?? 0}
          color="#a78bfa" delay={0.2}
        />
        <StatCard
          icon={TrendingUp} label={t('audit.stats.avgPerHour', 'TX/Hour Avg')}
          value={stats?.avgTxPerHour ?? '-'} color="#ec4899" delay={0.25}
        />
      </div>

      {/* ── Hourly Chart ────────────────────────────────────────────── */}
      <HourlyChart txPerHour={stats?.txPerHour} />

      {/* ── Top Users ───────────────────────────────────────────────── */}
      {stats?.topUsers?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="glass-card rounded-xl p-5 border"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <Users size={16} style={{ color: 'var(--color-primary)' }} />
            {t('audit.topUsers', 'Top 10 Users by TX')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {stats.topUsers.map((u, i) => (
              <div
                key={u.authorId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="font-bold text-[10px] w-5 text-center" style={{ color: i < 3 ? '#f59e0b' : 'var(--color-text-muted)' }}>
                  #{i + 1}
                </span>
                <span className="font-mono" style={{ color: 'var(--color-text)' }}>
                  {u.username || `${u.authorId.slice(0, 8)}...`}
                </span>
                <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                  {u.txCount}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Transaction Explorer ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="glass-card rounded-xl border overflow-hidden"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {/* Filters bar */}
        <div className="p-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            <Filter size={16} style={{ color: 'var(--color-primary)' }} />
            {t('audit.filters.title', 'Filters')}
          </div>

          {/* Tag dropdown */}
          <select
            value={filterTag}
            onChange={e => { setFilterTag(e.target.value); setPage(1); }}
            className="text-xs px-3 py-1.5 rounded-lg border bg-transparent outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <option value="">{t('audit.filters.allTypes', 'All Types')}</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{getTagConfig(tag).label}</option>
            ))}
          </select>

          {/* Author search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              value={filterAuthor}
              onChange={e => { setFilterAuthor(e.target.value); setPage(1); }}
              placeholder={t('audit.filters.user', 'User address...')}
              className="text-xs pl-7 pr-3 py-1.5 rounded-lg border bg-transparent outline-none w-40"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>

          {/* Date from */}
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
            className="text-xs px-3 py-1.5 rounded-lg border bg-transparent outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>-</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
            className="text-xs px-3 py-1.5 rounded-lg border bg-transparent outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />

          <div className="flex-1" />

          {/* Export CSV */}
          <motion.a
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            href={exportUrl}
            download
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
            style={{
              background: 'rgba(0,240,255,0.1)',
              color: 'var(--color-primary)',
              border: '1px solid rgba(0,240,255,0.2)',
            }}
          >
            <Download size={12} />
            {t('audit.export', 'Export CSV')}
          </motion.a>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {[
                  t('audit.table.timestamp', 'Timestamp'),
                  t('audit.table.type', 'Type'),
                  t('audit.table.user', 'User'),
                  t('audit.table.action', 'Action'),
                  t('audit.table.preview', 'Preview'),
                  t('audit.table.txDigest', 'TX Digest'),
                ].map(header => (
                  <th
                    key={header}
                    className="py-2.5 px-3 text-left text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {transactions.map(tx => (
                  <TxRow key={tx.id} tx={tx} isNew={newTxIds.has(tx.id)} />
                ))}
              </AnimatePresence>
              {transactions.length === 0 && !txLoading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    <Eye size={32} className="mx-auto mb-2 opacity-30" />
                    {t('audit.noTransactions', 'No transactions found')}
                  </td>
                </tr>
              )}
              {txLoading && transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    <RefreshCw size={20} className="mx-auto mb-2 animate-spin" style={{ color: 'var(--color-primary)' }} />
                    {t('common.loading')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('audit.pagination.showing', 'Showing')} {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} {t('audit.pagination.of', 'of')} {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border transition-colors disabled:opacity-30"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-mono px-2" style={{ color: 'var(--color-text)' }}>
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="p-1.5 rounded-lg border transition-colors disabled:opacity-30"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
