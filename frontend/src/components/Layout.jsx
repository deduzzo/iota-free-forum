import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home, BarChart3, Fingerprint, ShieldCheck, Users,
  Search, Wifi, WifiOff, Menu, Settings, Globe, Wallet,
  Loader2, AlertTriangle, Fuel, Store, Shield, Crown,
  LayoutGrid, User, Bell, MessageSquare, Activity, Vote,
} from 'lucide-react';
import Sidebar from './Sidebar';
import IdentityBadge from './IdentityBadge';
import OnboardingGuard from './OnboardingGuard';
import UnlockGuard from './UnlockGuard';
import GuestBanner from './GuestBanner';
import Toast from './Toast';
import TransactionTracker from './TransactionTracker';
import UpdateNotifier from './UpdateNotifier';
import NotificationBell from './NotificationBell';
import { useTheme } from '../hooks/useTheme';
import { useIdentity } from '../hooks/useIdentity';
import { useApi } from '../hooks/useApi';
import { useRealtimeUpdate } from '../hooks/useWebSocket';
import { api } from '../api/endpoints';
import { useTranslation } from 'react-i18next';

/* ── Toast context ─────────────────────────────────────────────── */

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within Layout');
  return ctx;
}

let _toastId = 0;

/* ── Forum nav items (same shape as Sidebar expects) ──────────── */

function getNavItems(isAdmin, t) {
  const items = [
    { to: '/', icon: Home, label: t('nav.home'), group: 'Forum' },
    { to: '/users', icon: Users, label: t('nav.users', 'Utenti'), group: 'Forum' },
    { to: '/dashboard', icon: BarChart3, label: t('nav.dashboard'), group: 'Forum' },
    { to: '/marketplace', icon: Store, label: t('nav.marketplace'), group: 'Forum' },
    { to: '/governance', icon: Vote, label: t('nav.governance', 'Governance'), group: 'Forum' },
    { to: '/notifications', icon: Bell, label: t('notifications.title'), group: 'Account' },
    { to: '/messages', icon: MessageSquare, label: t('dm.inbox', 'Messages'), group: 'Account' },
    { to: '/wallet', icon: Wallet, label: t('nav.wallet'), group: 'Account' },
    { to: '/escrow', icon: Shield, label: t('nav.escrow'), group: 'Account' },
    { to: '/subscription', icon: Crown, label: t('nav.subscription'), group: 'Account' },
    { to: '/identity', icon: Fingerprint, label: t('nav.identity'), group: 'Account' },
  ];
  if (isAdmin) {
    items.push({ to: '/admin', icon: ShieldCheck, label: t('nav.admin'), group: 'Account' });
    items.push({ to: '/admin/audit', icon: Activity, label: t('nav.audit', 'Audit'), group: 'Account' });
  }
  items.push(
    { to: '/settings', icon: Settings, label: t('nav.settings'), group: 'Account' },
    { to: '/setup', icon: Globe, label: t('nav.setup'), group: 'Account' },
  );
  return items;
}

/* ── Mobile bottom nav ────────────────────────────────────────── */

function MobileBottomNav({ navigate }) {
  const { t } = useTranslation();
  const { pathname: location } = useLocation();

  const items = [
    { to: '/', icon: Home, label: t('nav.home') },
    { to: '/users', icon: LayoutGrid, label: t('nav.categories', 'Explore') },
    { to: '/wallet', icon: Wallet, label: t('nav.wallet') },
    { to: '/identity', icon: User, label: t('nav.identity') },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t flex items-center justify-around px-2 py-1.5"
      style={{
        background: 'rgba(10, 10, 26, 0.75)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.to;
        return (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 min-w-[56px]"
            style={{
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              background: isActive ? 'rgba(0, 240, 255, 0.08)' : 'transparent',
            }}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            {isActive && (
              <motion.div
                layoutId="mobile-nav-indicator"
                className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                style={{ background: 'var(--color-primary)', boxShadow: '0 0 8px var(--color-primary)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

/* ── Layout ────────────────────────────────────────────────────── */

function SyncInfoButton({ isSynced, syncState, syncStatus }) {
  const { t } = useTranslation();
  const { getAuthHeaders, unlocked } = useIdentity();
  const [showPanel, setShowPanel] = useState(false);
  const [integrity, setIntegrity] = useState(null);
  const [loadingIntegrity, setLoadingIntegrity] = useState(false);

  async function fetchIntegrity() {
    if (!unlocked) return;
    setLoadingIntegrity(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/v1/integrity-check', { headers });
      const data = await res.json();
      setIntegrity(data);
    } catch { setIntegrity(null); }
    setLoadingIntegrity(false);
  }

  useEffect(() => {
    if (showPanel) fetchIntegrity();
  }, [showPanel]);

  return (
    <div className="relative">
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setShowPanel(p => !p)}
        className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg cursor-pointer"
        style={{
          color: isSynced ? 'var(--color-success)' : syncState === 'error' ? 'var(--color-danger)' : 'var(--color-warning)',
          background: isSynced ? 'rgba(0,255,136,0.1)' : syncState === 'error' ? 'rgba(255,68,68,0.1)' : 'rgba(255,170,0,0.1)',
        }}
      >
        {isSynced ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span className="hidden sm:inline">
          {isSynced ? t('sync.synced') : syncState === 'syncing' ? t('dashboard.syncing') : syncState === 'error' ? t('dashboard.error') : t('dashboard.idle')}
        </span>
      </motion.button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border p-4 text-xs shadow-lg"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}
          >
            <h4 className="font-bold text-sm mb-3" style={{ color: 'var(--color-text)' }}>{t('sync.title')}</h4>

            {/* Sync info */}
            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.status')}</span>
                <span style={{ color: isSynced ? 'var(--color-success)' : 'var(--color-warning)' }}>
                  {isSynced ? t('sync.synced') : syncState}
                </span>
              </div>
              {syncStatus?.sync?.lastSync && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.lastSync')}</span>
                  <span style={{ color: 'var(--color-text)' }}>{new Date(syncStatus.sync.lastSync).toLocaleString()}</span>
                </div>
              )}
              {syncStatus?.sync?.stats && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.syncStats')}</span>
                  <span style={{ color: 'var(--color-text)' }}>
                    U:{syncStatus.sync.stats.users} C:{syncStatus.sync.stats.categories} T:{syncStatus.sync.stats.threads} P:{syncStatus.sync.stats.posts} V:{syncStatus.sync.stats.votes}
                  </span>
                </div>
              )}
            </div>

            {/* Wallet */}
            {syncStatus?.wallet && (
              <div className="space-y-1.5 mb-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.wallet')}</span>
                  <span className="font-mono" style={{ color: 'var(--color-text)' }}>{syncStatus.wallet.address?.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.balance')}</span>
                  <span className="font-mono" style={{ color: 'var(--color-primary)' }}>{syncStatus.wallet.balance}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.network')}</span>
                  <span style={{ color: 'var(--color-text)' }}>{syncStatus.wallet.network}</span>
                </div>
              </div>
            )}

            {/* Integrity check */}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <h5 className="font-bold mb-2" style={{ color: 'var(--color-text)' }}>{t('sync.integrityCheck')}</h5>
              {loadingIntegrity && <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.verifying')}</span>}
              {integrity && !loadingIntegrity && (
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.state')}</span>
                    <span style={{ color: integrity.synced ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {integrity.synced ? t('sync.inSync') : t('sync.mismatch')}
                    </span>
                  </div>
                  {integrity.local && (
                    <>
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.localDb')}</span>
                        <span style={{ color: 'var(--color-text)' }}>
                          U:{integrity.local.users} C:{integrity.local.categories} T:{integrity.local.threads} P:{integrity.local.posts} V:{integrity.local.votes}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--color-text-muted)' }}>{t('sync.blockchain')}</span>
                        <span style={{ color: 'var(--color-text)' }}>
                          U:{integrity.chain.users} C:{integrity.chain.categories} T:{integrity.chain.threads} P:{integrity.chain.posts} V:{integrity.chain.votes}
                        </span>
                      </div>
                    </>
                  )}
                  {integrity.mismatches?.map((m, i) => (
                    <div key={i} className="px-2 py-1 rounded" style={{ background: 'rgba(255,68,68,0.1)', color: 'var(--color-danger)' }}>
                      {m.entity}: locale={m.local} chain={m.chain} (diff: {m.diff > 0 ? '+' : ''}{m.diff})
                    </div>
                  ))}
                  <button
                    onClick={fetchIntegrity}
                    className="mt-1 text-[10px] underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {t('sync.recheck')}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { forumName } = useTheme();
  const { identity } = useIdentity();
  const navigate = useNavigate();

  /* Sidebar collapse */
  const [collapsed, setCollapsed] = useState(false);

  /* Mobile sidebar toggle */
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Toast state */
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* Global WebSocket notifications */
  useRealtimeUpdate(
    useCallback((wsData) => {
      if (wsData.action === 'userPromotedAdmin' && wsData.userId === identity?.userId) {
        addToast('Sei stato promosso ad ADMIN on-chain!', 'success');
      }
      if (wsData.action === 'adminPromotionFailed' && wsData.userId === identity?.userId) {
        addToast('Promozione admin fallita: ' + (wsData.label || 'errore'), 'error');
      }
    }, [identity?.userId, addToast]),
    ['user', 'error'],
  );

  /* Sync status */
  const { data: syncStatus } = useApi(
    () => api.getSyncStatus(),
    [],
    ['sync'],
  );

  /* User role (check if admin) */
  const { data: userProfile } = useApi(
    () => identity?.userId ? api.getUser(identity.userId) : Promise.resolve(null),
    [identity?.userId],
    ['user'],
  );
  const isAdmin = userProfile?.user?.role === 'admin' || userProfile?.role === 'admin';

  /* Search */
  const [searchQuery, setSearchQuery] = useState('');

  function handleSearch(e) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  const syncState = syncStatus?.sync?.status || null;
  const isSynced = syncState === 'idle' && syncStatus?.sync?.lastSync;

  // Wallet balance check — block the entire site if insufficient
  const walletBalance = syncStatus?.wallet?.balance || '';
  const walletNetwork = syncStatus?.wallet?.network || 'testnet';
  const isTestnet = walletNetwork === 'testnet' || walletNetwork === 'devnet';
  // Parse balance: "9.999.000.000 nanos [9 IOTA]" → extract IOTA number
  const iotaMatch = walletBalance.match(/\[(\d+) IOTA\]/);
  const iotaBalance = iotaMatch ? parseInt(iotaMatch[1]) : null;
  const isLowBalance = iotaBalance !== null && iotaBalance < 1;
  const [refuelRequested, setRefuelRequested] = useState(false);

  // Auto-request faucet when balance is low (testnet only)
  useEffect(() => {
    if (!isLowBalance || refuelRequested) return;
    if (!isTestnet) return;

    setRefuelRequested(true);
    console.log('[Layout] Low balance detected, requesting faucet...');
    fetch('/api/v1/sync-status').then(r => r.json()).then(() => {
      // The server-side faucet monitor will handle it
      // We just trigger a refresh after a delay
      setTimeout(() => setRefuelRequested(false), 15000);
    }).catch(() => setTimeout(() => setRefuelRequested(false), 15000));
  }, [isLowBalance, isTestnet, refuelRequested]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      <UpdateNotifier />
      {/* Low balance blocker modal */}
      {isLowBalance && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-card p-8 rounded-xl max-w-lg mx-4 text-center"
            style={{ borderRadius: 'var(--border-radius)' }}
          >
            {isTestnet ? (
              <>
                <Loader2 size={48} className="animate-spin mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
                <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                  {t('layout.refueling')}
                </h2>
                <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  {t('layout.refuelingDesc')}
                </p>
                <div className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-warning)' }}>
                  <Fuel size={16} />
                  {t('layout.faucetRequested')}
                </div>
              </>
            ) : (
              <>
                <AlertTriangle size={48} className="mx-auto mb-4" style={{ color: 'var(--color-danger)' }} />
                <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                  {t('layout.lowBalanceTitle')}
                </h2>
                <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  {t('layout.lowBalanceDesc', { balance: iotaBalance, network: walletNetwork })}
                </p>
                <p className="text-sm font-mono p-3 rounded-lg mb-4" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-primary)' }}>
                  {syncStatus?.wallet?.address || t('layout.addressNotAvailable')}
                </p>
                <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
                  {t('layout.sendAtLeast')}
                </p>
              </>
            )}
          </motion.div>
        </div>
      )}
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
            navItems={getNavItems(isAdmin, t)}
          />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative z-50">
              <Sidebar
                collapsed={false}
                onToggle={() => setMobileOpen(false)}
                navItems={getNavItems(isAdmin, t)}
              />
            </div>
          </div>
        )}

        {/* Main area */}
        <div
          className="flex-1 flex flex-col min-h-screen transition-[margin] duration-300 ml-0 md:ml-[var(--sidebar-w)]"
          style={{ '--sidebar-w': collapsed ? '72px' : '260px' }}
        >
          {/* Top bar */}
          <header
            className="sticky top-0 z-30 glass-static border-b border-white/10 px-4 md:px-6 py-3 flex items-center gap-4"
          >
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Menu size={20} />
            </button>

            {/* Forum name */}
            <h1
              className="text-lg font-bold neon-text hidden sm:block shrink-0"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {forumName}
            </h1>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 max-w-md mx-auto">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-text-muted)' }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('nav.search')}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border bg-transparent outline-none text-sm transition-colors"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
            </form>

            {/* Wallet balance (visible to all) + Sync status */}
            <div className="flex items-center gap-2 shrink-0">
              {iotaBalance !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg cursor-pointer"
                  style={{
                    color: isLowBalance ? 'var(--color-danger)' : 'var(--color-primary)',
                    background: isLowBalance ? 'rgba(255,68,68,0.1)' : 'rgba(0,240,255,0.08)',
                  }}
                  title={`Wallet: ${syncStatus?.wallet?.address || ''}\nNetwork: ${walletNetwork}`}
                  onClick={() => navigate('/dashboard')}
                >
                  <Wallet size={13} />
                  <span className="font-mono">
                    {iotaBalance} <span style={{ color: 'var(--color-text-muted)' }}>IOTA</span>
                  </span>
                </motion.div>
              )}
              {syncState && (
                <SyncInfoButton
                  isSynced={isSynced}
                  syncState={syncState}
                  syncStatus={syncStatus}
                />
              )}

              {/* Notification bell */}
              {identity && <NotificationBell />}

              {/* Identity badge + role */}
              {identity && (
                <div className="flex items-center gap-2">
                  <IdentityBadge
                    userId={identity.userId}
                    username={identity.username}
                    showUsername={true}
                    size="sm"
                  />
                  {(() => {
                    const role = userProfile?.user?.role;
                    if (!role) return null;
                    const colors = {
                      admin: { bg: 'rgba(255,68,68,0.15)', color: '#ff4444' },
                      moderator: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
                      user: { bg: 'rgba(0,240,255,0.15)', color: 'var(--color-primary)' },
                    };
                    const c = colors[role] || colors.user;
                    return (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                        style={{ backgroundColor: c.bg, color: c.color, border: `1px solid ${c.color}30` }}
                      >
                        {role}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <OnboardingGuard>
              <UnlockGuard>
                <Outlet />
              </UnlockGuard>
            </OnboardingGuard>
            {/* Guest banner — show only if user has no wallet and identity check is done */}
            {!identity && <GuestBanner identityChecked={true} />}
          </main>
        </div>

        {/* Mobile bottom nav bar */}
        <MobileBottomNav navigate={navigate} />

        {/* Toasts */}
        <Toast toasts={toasts} onDismiss={dismissToast} />
        <TransactionTracker />
      </div>
    </ToastContext.Provider>
  );
}
