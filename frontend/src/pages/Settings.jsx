import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw, Trash2, Database, HardDrive, User,
  AlertTriangle, CheckCircle, Loader2, Download, Bug,
  ExternalLink, Shield, AlertCircle, Globe,
} from 'lucide-react';
import { useIdentity } from '../hooks/useIdentity';
import { useToast } from '../components/Layout';
import { useTheme } from '../hooks/useTheme';
import { themes } from '../data/themes';
import { Palette, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';

function ActionCard({ icon: Icon, title, description, buttonText, buttonColor, onAction, loading, danger }) {
  return (
    <motion.div
      className="glass-card p-6 rounded-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ borderRadius: 'var(--border-radius)' }}
    >
      <div className="flex items-start gap-4">
        <div
          className="p-3 rounded-lg shrink-0"
          style={{ backgroundColor: danger ? 'rgba(255,68,68,0.15)' : 'rgba(var(--color-primary-rgb, 0,240,255),0.15)' }}
        >
          <Icon size={24} style={{ color: danger ? 'var(--color-danger)' : 'var(--color-primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
        </div>
        <button
          onClick={onAction}
          disabled={loading}
          className="px-4 py-2 rounded-lg font-medium text-sm transition-all shrink-0 flex items-center gap-2"
          style={{
            backgroundColor: danger ? 'var(--color-danger)' : 'var(--color-primary)',
            color: 'var(--color-background)',
            opacity: loading ? 0.6 : 1,
            borderRadius: 'var(--border-radius)',
          }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {buttonText}
        </button>
      </div>
    </motion.div>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { identity, unlocked, unlockIdentity, clearIdentity, exportIdentity, getAuthHeaders } = useIdentity();
  const { addToast } = useToast();
  const [loading, setLoading] = useState({});
  const [confirmReset, setConfirmReset] = useState(null);
  const [doubleConfirm, setDoubleConfirm] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [logs, setLogs] = useState([]);
  const [forumInfo, setForumInfo] = useState(null);

  const { activeThemeId, userThemeId, setUserTheme } = useTheme();

  useEffect(() => {
    fetch('/api/v1/forum-info').then(r => r.json()).then(setForumInfo).catch(() => {});
  }, []);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [{ ts, msg, type }, ...prev].slice(0, 100));
  };

  // Helper: build signed admin payload
  const buildAdminPayload = async (action, extra = {}) => {
    if (!identity?.address) throw new Error('No identity');
    const timestamp = Date.now();
    const message = JSON.stringify({ action, adminAddress: identity.address, timestamp });
    // Build the payload — backend will verify admin role
    return { adminAddress: identity.address, timestamp, signature: btoa(message), ...extra };
  };

  // Reset cache SQLite senza risincronizzazione
  const resetCache = async () => {
    setLoading(l => ({ ...l, cache: true }));
    addLog('Resetting server cache (no resync)...');
    try {
      const payload = await buildAdminPayload('sync-reset', { resync: false });
      const res = await fetch('/api/v1/sync-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        addLog('Server cache cleared (no resync)', 'success');
        addToast('Cache server azzerata', 'success');
      } else {
        addLog(`Cache reset failed: ${data.error}`, 'error');
        addToast('Errore reset cache: ' + (data.error || 'Unknown'), 'error');
      }
    } catch (err) {
      addLog(`Cache reset error: ${err.message}`, 'error');
      addToast('Errore: ' + err.message, 'error');
    }
    setLoading(l => ({ ...l, cache: false }));
  };

  // Risincronizza dalla blockchain (ricarica i dati on-chain nel DB locale)
  const resyncFromChain = async () => {
    setLoading(l => ({ ...l, resync: true }));
    addLog('Starting resync from blockchain...');
    try {
      const payload = await buildAdminPayload('sync-reset', { resync: true });
      const res = await fetch('/api/v1/sync-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        addLog('Cache cleared + resync from blockchain started', 'success');
        addToast('Risincronizzazione dalla blockchain avviata', 'success');
      } else {
        addLog(`Resync failed: ${data.error}`, 'error');
      }
    } catch (err) {
      addLog(`Resync error: ${err.message}`, 'error');
    }
    setLoading(l => ({ ...l, resync: false }));
  };

  // Reset identità locale (localStorage)
  const resetIdentity = () => {
    addLog('Clearing local identity...');
    clearIdentity();
    addLog('Local identity cleared', 'success');
    addToast('Identità locale cancellata', 'success');
    setConfirmReset(null);
  };

  // Full reset: new wallet + clear DB + clear browser
  // Modal stays open with loading spinner during this operation
  const fullReset = async () => {
    setLoading(l => ({ ...l, full: true }));
    addLog('Starting FULL reset (new wallet + clear everything)...');
    console.log('[Settings] Full reset started...');

    // 1. Server-side full reset (new mnemonic, new wallet, clear DB)
    try {
      const payload = {
        adminAddress: identity?.address || identity?.userId || null,
        timestamp: Date.now(),
      };
      const res = await fetch('/api/v1/full-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        addLog(`Server reset OK. New wallet: ${data.newAddress}`, 'success');
      } else {
        addLog(`Server reset failed: ${data.error}`, 'error');
      }
    } catch (err) {
      addLog(`Server reset error: ${err.message}`, 'error');
    }

    // 2. Clear all localStorage
    localStorage.clear();

    // 3. Clear sessionStorage
    sessionStorage.clear();
    addLog('sessionStorage cleared', 'success');

    // Force reload immediately — no need to update state since page will refresh
    window.location.href = '/setup';
  };

  // Export dei dati del server
  const exportData = async () => {
    setLoading(l => ({ ...l, export: true }));
    addLog('Exporting server data...');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/v1/export-data', { headers });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iota-forum-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addLog('Data exported successfully', 'success');
      addToast('Dati esportati', 'success');
    } catch (err) {
      addLog(`Export failed: ${err.message}`, 'error');
      addToast('Errore export: ' + err.message, 'error');
    }
    setLoading(l => ({ ...l, export: false }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          {t('settings.title')}
        </h1>
        <p className="mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('settings.subtitle')}
        </p>
      </div>

      {/* Tema personale */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 rounded-xl"
        style={{ borderRadius: 'var(--border-radius)' }}
      >
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Palette size={20} style={{ color: 'var(--color-primary)' }} />
          {t('settings.theme')}
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('settings.themeDesc')}
        </p>

        {/* "Usa default" option */}
        <button
          onClick={() => setUserTheme(null)}
          className="w-full mb-3 p-3 rounded-xl border text-sm text-left flex items-center justify-between transition-colors"
          style={{
            borderColor: !userThemeId ? 'var(--color-primary)' : 'var(--color-border)',
            background: !userThemeId ? 'rgba(0,240,255,0.06)' : 'transparent',
            color: 'var(--color-text)',
          }}
        >
          <span>{t('settings.useDefault')}</span>
          {!userThemeId && <Check size={16} style={{ color: 'var(--color-primary)' }} />}
        </button>

        {/* Theme grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {themes.map((th) => {
            const isSelected = activeThemeId === th.id;
            return (
              <button
                key={th.id}
                onClick={() => setUserTheme(th.id)}
                className="p-3 rounded-xl border text-left transition-all"
                style={{
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  background: isSelected ? 'rgba(0,240,255,0.06)' : 'var(--color-surface)',
                  boxShadow: isSelected ? `0 0 12px rgba(0,240,255,0.15)` : 'none',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {th.name}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      background: th.category === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {th.category === 'dark' ? t('settings.dark') : t('settings.light')}
                  </span>
                </div>
                {/* Color preview dots */}
                <div className="flex gap-1.5">
                  {[th.base.background, th.base.surface, th.accent.primary, th.accent.secondary, th.accent.success].map((c, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full border"
                      style={{ background: c, borderColor: 'rgba(128,128,128,0.3)' }}
                    />
                  ))}
                </div>
                {isSelected && (
                  <div className="mt-2 flex items-center gap-1">
                    <Check size={12} style={{ color: 'var(--color-primary)' }} />
                    <span className="text-xs" style={{ color: 'var(--color-primary)' }}>{t('settings.active')}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Language picker */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-xl" style={{ borderRadius: 'var(--border-radius)' }}>
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Globe size={20} style={{ color: 'var(--color-primary)' }} />
          {t('settings.language')}
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>{t('settings.languageDesc')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {LANGUAGES.map((lang) => (
            <button key={lang.code} onClick={() => i18n.changeLanguage(lang.code)}
              className="p-2.5 rounded-xl border text-sm text-center transition-all"
              style={{
                borderColor: i18n.language?.startsWith(lang.code) ? 'var(--color-primary)' : 'var(--color-border)',
                background: i18n.language?.startsWith(lang.code) ? 'rgba(0,240,255,0.06)' : 'var(--color-surface)',
                color: 'var(--color-text)',
              }}>
              <span className="text-lg">{lang.flag}</span>
              <div className="text-xs mt-0.5">{lang.name}</div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Stato corrente */}
      <div className="glass-card p-6 rounded-xl" style={{ borderRadius: 'var(--border-radius)' }}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Database size={20} style={{ color: 'var(--color-primary)' }} />
          {t('settings.currentStatus')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{t('settings.localIdentity')}</span>
            <div className="font-mono mt-1" style={{ color: identity ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {identity ? `${identity.username || 'No username'} (${identity.userId?.substring(0, 12)}...)` : t('settings.none')}
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>localStorage</span>
            <div className="font-mono mt-1">
              {Object.keys(localStorage).length} {t('settings.keys')}
            </div>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Keypair</span>
            <div className="font-mono mt-1" style={{ color: identity?.publicKey ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {identity?.publicKey ? t('settings.keypairPresent') : t('settings.notGenerated')}
            </div>
          </div>
        </div>
      </div>

      {/* Smart Contract */}
      <div className="glass-card p-6 rounded-xl" style={{ borderRadius: 'var(--border-radius)' }}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield size={20} style={{ color: 'var(--color-primary)' }} />
          Smart Contract Move
        </h2>
        {forumInfo?.moveMode ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
                <span className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Package ID</span>
                <code className="text-xs font-mono break-all" style={{ color: 'var(--color-primary)' }}>
                  {forumInfo.packageId}
                </code>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
                <span className="text-xs block mb-1" style={{ color: 'var(--color-text-muted)' }}>Forum Object ID</span>
                <code className="text-xs font-mono break-all" style={{ color: 'var(--color-primary)' }}>
                  {forumInfo.forumObjectId}
                </code>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <span className="flex items-center gap-1">
                <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                {t('settings.contractActive')} <strong style={{ color: 'var(--color-text)' }}>{forumInfo.network}</strong>
              </span>
              {forumInfo.explorerUrl && forumInfo.packageId && (
                <a
                  href={`${forumInfo.explorerUrl}/object/${forumInfo.packageId}?network=${forumInfo.network}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 ml-auto"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <ExternalLink size={12} />
                  {t('home.viewOnExplorer')}
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: 'rgba(255,170,0,0.1)' }}>
            <AlertCircle size={20} style={{ color: 'var(--color-warning)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
                {t('settings.contractNotDeployed')}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {t('home.runInTerminal')} <code style={{ color: 'var(--color-text)' }}>npm run move:deploy</code>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Azioni */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <HardDrive size={20} style={{ color: 'var(--color-primary)' }} />
          {t('settings.actions')}
        </h2>

        <ActionCard
          icon={Download}
          title={t('settings.exportData')}
          description={t('settings.exportDataDesc')}
          buttonText={t('settings.export')}
          onAction={exportData}
          loading={loading.export}
        />

        {identity && (
          <ActionCard
            icon={Download}
            title={t('settings.exportIdentity')}
            description={t('settings.exportIdentityDesc')}
            buttonText={t('settings.export')}
            onAction={exportIdentity}
          />
        )}

        <ActionCard
          icon={RotateCcw}
          title={t('settings.resync')}
          description={t('settings.resyncDesc')}
          buttonText={t('settings.resyncBtn')}
          onAction={resyncFromChain}
          loading={loading.resync}
        />

        <ActionCard
          icon={Database}
          title={t('settings.resetCache')}
          description={t('settings.resetCacheDesc')}
          buttonText={t('settings.resetCacheBtn')}
          onAction={resetCache}
          loading={loading.cache}
        />

        <ActionCard
          icon={User}
          title={t('settings.deleteIdentity')}
          description={t('settings.deleteIdentityDesc')}
          buttonText={t('settings.deleteBtn')}
          danger
          onAction={() => setConfirmReset('identity')}
        />

        <ActionCard
          icon={Trash2}
          title={t('settings.fullReset')}
          description={t('settings.fullResetDesc')}
          buttonText={t('settings.fullResetBtn')}
          danger
          onAction={() => setConfirmReset('full')}
          loading={loading.full}
        />
      </div>

      {/* Confirm modal — double confirmation for full reset */}
      <AnimatePresence>
        {confirmReset && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onClick={loading.full ? undefined : () => { setConfirmReset(null); setDoubleConfirm(false); }} />
            <motion.div
              className="relative p-6 rounded-xl max-w-md mx-4 border"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                borderRadius: 'var(--border-radius)',
                background: 'var(--color-background)',
                borderColor: 'var(--color-border)',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              }}
            >
              {/* State: resetting in progress */}
              {loading.full ? (
                <div className="text-center py-4">
                  <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="text-lg font-bold mb-2">{t('settings.resetInProgress')}</h3>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {t('settings.resetInProgressDesc')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle size={24} style={{ color: 'var(--color-danger)' }} />
                    <h3 className="text-lg font-bold">
                      {confirmReset === 'full' && doubleConfirm ? t('settings.finalConfirmation') : t('settings.confirm')}
                    </h3>
                  </div>

                  {confirmReset === 'identity' && (
                    <p className="mb-6" style={{ color: 'var(--color-text-muted)' }}>
                      {t('settings.deleteIdentityConfirm')}
                    </p>
                  )}

                  {confirmReset === 'full' && !doubleConfirm && (
                    <div className="mb-6 space-y-3">
                      <p style={{ color: 'var(--color-danger)' }} className="font-semibold">
                        {t('settings.destructiveWarning')}
                      </p>
                      <p style={{ color: 'var(--color-text-muted)' }}>
                        {t('settings.fullResetWarning')}
                      </p>
                      <p style={{ color: 'var(--color-text-muted)' }}>
                        {t('settings.oldDataWarning')}
                      </p>
                    </div>
                  )}

                  {confirmReset === 'full' && doubleConfirm && (
                    <div className="mb-6 space-y-3">
                      <p style={{ color: 'var(--color-danger)' }} className="font-bold text-lg">
                        {t('settings.areYouSure')}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        {t('settings.enterPasswordToConfirm', 'Enter your wallet password to confirm the reset.')}
                      </p>
                      <input
                        type="password"
                        value={resetPassword}
                        onChange={(e) => { setResetPassword(e.target.value); setResetPasswordError(''); }}
                        placeholder={t('settings.walletPassword', 'Wallet password')}
                        className="w-full px-3 py-2 rounded-lg border bg-transparent text-sm outline-none"
                        style={{ borderColor: resetPasswordError ? 'var(--color-danger)' : 'var(--color-border)', color: 'var(--color-text)' }}
                        autoFocus
                      />
                      {resetPasswordError && (
                        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{resetPasswordError}</p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      className="px-4 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderRadius: 'var(--border-radius)' }}
                      onClick={() => { setConfirmReset(null); setDoubleConfirm(false); setResetPassword(''); setResetPasswordError(''); }}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: 'var(--color-danger)', color: '#fff', borderRadius: 'var(--border-radius)' }}
                      onClick={async () => {
                        if (confirmReset === 'identity') {
                          resetIdentity();
                        } else if (confirmReset === 'full' && !doubleConfirm) {
                          setDoubleConfirm(true);
                        } else if (confirmReset === 'full' && doubleConfirm) {
                          if (!resetPassword) {
                            setResetPasswordError(t('settings.passwordRequired', 'Password required'));
                            return;
                          }
                          // Always verify password by decrypting mnemonic
                          try {
                            const { decryptMnemonic } = await import('../api/crypto');
                            await decryptMnemonic(identity.encryptedMnemonic, resetPassword);
                            fullReset();
                          } catch (err) {
                            setResetPasswordError(t('settings.wrongPassword', 'Wrong password'));
                          }
                        }
                      }}
                    >
                      {confirmReset === 'identity' ? t('settings.confirm') : confirmReset === 'full' && !doubleConfirm ? t('settings.continue') : t('settings.confirmFullReset')}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log console */}
      <div className="glass-card p-6 rounded-xl" style={{ borderRadius: 'var(--border-radius)' }}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Bug size={20} style={{ color: 'var(--color-primary)' }} />
          {t('settings.operationLog')}
        </h2>
        <div
          className="font-mono text-xs space-y-1 max-h-64 overflow-y-auto p-3 rounded-lg"
          style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-muted)' }}
        >
          {logs.length === 0 && <div>{t('settings.noOperations')}</div>}
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2">
              <span style={{ color: 'var(--color-text-muted)' }}>{log.ts}</span>
              <span style={{
                color: log.type === 'error' ? 'var(--color-danger)'
                  : log.type === 'success' ? 'var(--color-success)'
                  : 'var(--color-text)',
              }}>
                {log.msg}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
