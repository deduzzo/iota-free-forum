import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key, User, Download, Upload, Shield, Copy, RefreshCw,
  CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  Fingerprint, Eye, EyeOff, Loader2, Lock, Unlock,
  Wallet, Droplets, LogOut,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useIdentity } from '../hooks/useIdentity';
import { useWallet, formatIota } from '../hooks/useWallet';

// ─── Password strength indicator ──────────────────────────────────────────────
function PasswordStrength({ password, t }) {
  if (!password) return null;

  let level, color, label;
  if (password.length < 6) {
    level = 1; color = 'var(--color-danger)'; label = t('identity.passwordStrength.weak', 'Weak');
  } else if (password.length < 10) {
    level = 2; color = 'var(--color-warning)'; label = t('identity.passwordStrength.medium', 'Medium');
  } else {
    level = 3; color = 'var(--color-success)'; label = t('identity.passwordStrength.strong', 'Strong');
  }

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 flex gap-1">
        {[1, 2, 3].map(i => (
          <motion.div
            key={i}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            className="h-1 rounded-full flex-1"
            style={{
              backgroundColor: i <= level ? color : 'var(--color-border)',
              transformOrigin: 'left',
            }}
          />
        ))}
      </div>
      <span className="text-xs font-medium" style={{ color }}>{label}</span>
    </div>
  );
}

const fadeSlide = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.4, ease: 'easeOut' },
};

export default function Identity() {
  const { t } = useTranslation();
  const {
    identity, loading, unlocked, forumConfig,
    generateIdentity, confirmMnemonicSaved, unlockIdentity, lockIdentity,
    registerUsername, exportMnemonic, importIdentity,
    clearIdentity, postEvent,
  } = useIdentity();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
        >
          <Key size={32} className="text-[var(--color-primary)]" />
        </motion.div>
      </div>
    );
  }

  // Determine UI state
  let state = 'none';
  if (identity && !unlocked) state = 'locked';
  else if (identity && unlocked && !identity.username) state = 'no-username';
  else if (identity && unlocked && identity.username) state = 'registered';

  // Show message if redirected from a protected route
  const location = useLocation();
  const fromProtected = location.state?.fromProtected;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-bold mb-8 flex items-center gap-3"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        <Shield size={28} className="text-[var(--color-primary)]" />
        {t('identity.title')}
      </motion.h1>

      {/* Message for guests redirected from protected routes */}
      {fromProtected && !identity && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl border flex items-center gap-3"
          style={{
            borderColor: 'var(--color-warning)',
            backgroundColor: 'rgba(255,170,0,0.08)',
          }}
        >
          <AlertTriangle size={20} style={{ color: 'var(--color-warning)' }} />
          <p className="text-sm" style={{ color: 'var(--color-warning)' }}>
            {t('identity.walletRequired', 'You need a wallet to access that page. Create one below to get started.')}
          </p>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {state === 'none' && (
          <NoIdentityCard
            key="none"
            onGenerate={generateIdentity}
            onConfirmMnemonic={confirmMnemonicSaved}
            onImport={importIdentity}
          />
        )}
        {state === 'locked' && (
          <LockedCard
            key="locked"
            identity={identity}
            onUnlock={unlockIdentity}
            onClear={clearIdentity}
          />
        )}
        {state === 'no-username' && (
          <UsernameCard
            key="username"
            identity={identity}
            forumConfig={forumConfig}
            onRegister={registerUsername}
            onLock={lockIdentity}
          />
        )}
        {state === 'registered' && (
          <RegisteredCard
            key="registered"
            identity={identity}
            onExportMnemonic={exportMnemonic}
            onImport={importIdentity}
            onGenerate={generateIdentity}
            onClear={clearIdentity}
            onLock={lockIdentity}
            postEvent={postEvent}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── State 1: No identity ───────────────────────────────────────────────────

function NoIdentityCard({ onGenerate, onConfirmMnemonic, onImport }) {
  const { t } = useTranslation();
  const [generating, setGenerating] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mnemonic, setMnemonic] = useState(null);
  const [mnemonicSaved, setMnemonicSaved] = useState(false);
  const [error, setError] = useState('');
  const [importMode, setImportMode] = useState(false);
  const [importMnemonic, setImportMnemonic] = useState('');

  const passwordValid = password.length >= 4 && password === confirmPassword;

  async function handleGenerate() {
    if (!passwordValid) return;
    setGenerating(true);
    setError('');
    try {
      const result = await onGenerate(password);
      setMnemonic(result.mnemonic);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleImport() {
    if (!passwordValid || !importMnemonic.trim()) return;
    setGenerating(true);
    setError('');
    try {
      await onImport(importMnemonic.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // Show mnemonic after generation — user must confirm they saved it
  if (mnemonic && !mnemonicSaved) {
    return (
      <motion.div {...fadeSlide} className="glass-card">
        <div className="flex justify-center mb-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--color-warning), #f59e0b)' }}
          >
            <AlertTriangle size={32} className="text-white" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          {t('identity.saveMnemonic', 'Save Your Recovery Phrase')}
        </h2>
        <p className="text-center text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('identity.mnemonicWarning', 'Write down these 12 words and store them safely. This is the ONLY way to recover your wallet. They will NOT be shown again.')}
        </p>

        <div
          className="grid grid-cols-3 gap-2 p-4 rounded-xl mb-4"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {mnemonic.split(' ').map((word, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'var(--color-bg)' }}>
              <span className="text-xs font-mono w-5 text-right" style={{ color: 'var(--color-text-muted)' }}>{i + 1}</span>
              <span className="text-sm font-mono font-medium">{word}</span>
            </div>
          ))}
        </div>

        <CopyButton text={mnemonic} label={t('identity.copyMnemonic', 'Copy to clipboard')} />

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { onConfirmMnemonic(); setMnemonicSaved(true); }}
          className="btn-primary w-full py-3 rounded-xl font-semibold text-lg mt-3"
        >
          {t('identity.mnemonicSavedConfirm', "I've saved my recovery phrase")}
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeSlide} className="glass-card">
      {/* Animated icon */}
      <div className="flex justify-center mb-6">
        <motion.div
          animate={{
            boxShadow: [
              '0 0 20px rgba(var(--color-primary-rgb, 0, 240, 255), 0.2)',
              '0 0 40px rgba(var(--color-primary-rgb, 0, 240, 255), 0.4)',
              '0 0 20px rgba(var(--color-primary-rgb, 0, 240, 255), 0.2)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="w-24 h-24 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}
        >
          <Wallet size={44} className="text-white" />
        </motion.div>
      </div>

      <h2 className="text-2xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
        {importMode
          ? t('identity.importTitle', 'Import Wallet')
          : t('identity.generateTitle', 'Generate your Identity')}
      </h2>
      <p className="text-center mb-6" style={{ color: 'var(--color-text-muted)' }}>
        {importMode
          ? t('identity.importDesc', 'Enter your 12-word recovery phrase to restore your wallet.')
          : t('identity.generateDescNew', 'Your identity is an IOTA Ed25519 wallet stored only in your browser. Protected by your password, backed up by a 12-word recovery phrase.')}
      </p>

      {/* Import mnemonic textarea */}
      {importMode && (
        <textarea
          value={importMnemonic}
          onChange={(e) => setImportMnemonic(e.target.value)}
          placeholder={t('identity.mnemonicPlaceholder', 'Enter your 12-word recovery phrase...')}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border bg-transparent outline-none transition-colors font-mono text-sm mb-4 resize-none"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
        />
      )}

      {/* Password fields */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('identity.passwordPlaceholder', 'Choose a password (min 4 chars)')}
            className="w-full pl-10 pr-10 py-3 rounded-xl border bg-transparent outline-none transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <PasswordStrength password={password} t={t} />

        <div className="relative">
          <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('identity.confirmPassword', 'Confirm password')}
            className="w-full pl-10 pr-4 py-3 rounded-xl border bg-transparent outline-none transition-colors"
            style={{
              borderColor: confirmPassword && confirmPassword !== password ? 'var(--color-danger)' : 'var(--color-border)',
              color: 'var(--color-text)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
            onBlur={(e) => (e.target.style.borderColor = confirmPassword && confirmPassword !== password ? 'var(--color-danger)' : 'var(--color-border)')}
          />
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--color-danger)' }}>
          <AlertTriangle size={16} />
          {error}
        </motion.div>
      )}

      <div className="flex flex-col gap-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={importMode ? handleImport : handleGenerate}
          disabled={generating || !passwordValid || (importMode && !importMnemonic.trim())}
          className="btn-primary flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-lg disabled:opacity-50"
        >
          {generating ? (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <RefreshCw size={20} />
              </motion.div>
              {t('identity.generating')}
            </>
          ) : importMode ? (
            <>
              <Upload size={20} />
              {t('identity.importRestore', 'Restore Wallet')}
            </>
          ) : (
            <>
              <Fingerprint size={20} />
              {t('identity.generateWallet', 'Generate Wallet')}
            </>
          )}
        </motion.button>

        <button
          onClick={() => { setImportMode(!importMode); setError(''); }}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {importMode ? (
            <>
              <Fingerprint size={18} />
              {t('identity.switchToGenerate', 'Generate new wallet instead')}
            </>
          ) : (
            <>
              <Upload size={18} />
              {t('identity.importExisting')}
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ─── State 2: Locked (has identity, needs password) ─────────────────────────

function LockedCard({ identity, onUnlock, onClear }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function handleUnlock(e) {
    e.preventDefault();
    if (!password) return;
    setError('');
    setUnlocking(true);
    try {
      await onUnlock(password);
    } catch (err) {
      setError(t('identity.wrongPassword', 'Wrong password. Please try again.'));
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <motion.div {...fadeSlide} className="glass-card">
      <div className="flex justify-center mb-6">
        <motion.div
          animate={{
            boxShadow: [
              '0 0 20px rgba(var(--color-primary-rgb, 0, 240, 255), 0.15)',
              '0 0 30px rgba(var(--color-primary-rgb, 0, 240, 255), 0.3)',
              '0 0 20px rgba(var(--color-primary-rgb, 0, 240, 255), 0.15)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}
        >
          <Lock size={36} className="text-white" />
        </motion.div>
      </div>

      <h2 className="text-2xl font-bold text-center mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
        {t('identity.unlockWallet', 'Unlock Wallet')}
      </h2>
      <p className="text-center text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
        {identity.username && (
          <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>{identity.username} &mdash; </span>
        )}
        <span className="font-mono text-xs">{identity.address?.slice(0, 10)}...{identity.address?.slice(-6)}</span>
      </p>
      <p className="text-center text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
        {t('identity.enterPasswordToUnlock', 'Enter your password to unlock your wallet and sign transactions.')}
      </p>

      <form onSubmit={handleUnlock} className="space-y-4">
        <div className="relative">
          <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('identity.passwordPlaceholder', 'Enter password')}
            autoFocus
            className="w-full pl-10 pr-10 py-3 rounded-xl border bg-transparent outline-none transition-colors"
            style={{ borderColor: error ? 'var(--color-danger)' : 'var(--color-border)', color: 'var(--color-text)' }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
            onBlur={(e) => (e.target.style.borderColor = error ? 'var(--color-danger)' : 'var(--color-border)')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-danger)' }}>
            <AlertTriangle size={16} />
            {error}
          </motion.div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={!password || unlocking}
          className="btn-primary w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {unlocking ? (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <Loader2 size={20} />
              </motion.div>
              {t('identity.unlocking', 'Unlocking...')}
            </>
          ) : (
            <>
              <Unlock size={20} />
              {t('identity.unlock', 'Unlock')}
            </>
          )}
        </motion.button>
      </form>

      {/* Clear identity option */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={() => {
            if (confirmClear) { onClear(); setConfirmClear(false); }
            else setConfirmClear(true);
          }}
          className="flex items-center gap-2 text-xs w-full justify-center py-2 rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: confirmClear ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
        >
          <AlertTriangle size={14} />
          {confirmClear
            ? t('identity.confirmClear', 'Click again to permanently delete this wallet')
            : t('identity.forgotPassword', 'Forgot password? Reset wallet')}
        </button>
      </div>
    </motion.div>
  );
}

// ─── State 3: Unlocked, no username ─────────────────────────────────────────

function UsernameCard({ identity, forumConfig, onRegister, onLock }) {
  const { t } = useTranslation();
  const { requestFaucet, balanceFormatted, refreshBalance } = useWallet();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetDone, setFaucetDone] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState([]);
  const [deployDone, setDeployDone] = useState(false);

  const isValid = /^[a-zA-Z0-9_]{3,20}$/.test(username);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid) return;
    setError('');
    setSubmitting(true);
    try {
      await onRegister(username);
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  async function handleFaucet() {
    setFaucetLoading(true);
    try {
      await requestFaucet();
      setFaucetDone(true);
      setTimeout(() => setFaucetDone(false), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setFaucetLoading(false);
    }
  }

  return (
    <motion.div {...fadeSlide} className="glass-card">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}
        >
          <CheckCircle size={22} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('identity.walletCreated', 'Wallet created')}</p>
          <p className="font-mono text-xs truncate" style={{ color: 'var(--color-primary)' }}>
            {identity.address}
          </p>
        </div>
      </div>

      {/* Balance + Faucet */}
      <div className="flex items-center justify-between p-3 rounded-xl mb-4" style={{ background: 'var(--color-surface)' }}>
        <div className="flex items-center gap-2">
          <Wallet size={16} style={{ color: 'var(--color-text-muted)' }} />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('identity.balance', 'Balance')}:
          </span>
          <span className="font-mono font-semibold">{balanceFormatted} IOTA</span>
        </div>
        <button
          onClick={handleFaucet}
          disabled={faucetLoading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: faucetDone ? 'rgba(34, 197, 94, 0.15)' : 'rgba(var(--color-primary-rgb, 0, 240, 255), 0.1)',
            color: faucetDone ? 'var(--color-success)' : 'var(--color-primary)',
          }}
        >
          {faucetLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : faucetDone ? (
            <CheckCircle size={12} />
          ) : (
            <Droplets size={12} />
          )}
          {faucetDone ? t('identity.faucetSent', 'Sent!') : t('identity.requestGas', 'Get Gas')}
        </button>
      </div>

      {/* Deploy contract banner */}
      {(!forumConfig?.packageId && !deployDone) && (
        <div
          className="p-4 rounded-xl border mb-4"
          style={{
            borderColor: deploying ? 'var(--color-primary)' : 'var(--color-warning)',
            backgroundColor: deploying ? 'rgba(0,240,255,0.05)' : 'rgba(255,170,0,0.08)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            {deploying ? (
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            ) : (
              <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
            )}
            <span className="font-bold" style={{ color: deploying ? 'var(--color-primary)' : 'var(--color-warning)' }}>
              {deploying
                ? t('identity.deploying', 'Deploying smart contract...')
                : t('identity.contractNotDeployed', 'Smart contract not deployed')}
            </span>
          </div>

          {!deploying && (
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
              {t('identity.deployDesc', 'The forum needs a smart contract on the IOTA blockchain. Click below to deploy it automatically.')}
            </p>
          )}

          {deployLogs.length > 0 && (
            <div
              className="p-3 rounded-lg mb-3 text-xs font-mono max-h-40 overflow-y-auto space-y-0.5"
              style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-muted)' }}
            >
              {deployLogs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          )}

          {!deploying && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                setDeploying(true);
                setDeployLogs(['Starting deployment...']);
                setError('');
                try {
                  const { api } = await import('../api/endpoints');
                  const result = await api.deployContract();
                  if (result.success) {
                    setDeployLogs(result.logs || ['Deploy completed!']);
                    setDeployDone(true);
                    // Reload page to pick up new config
                    setTimeout(() => window.location.reload(), 2000);
                  } else {
                    setDeployLogs(result.logs || [result.error || 'Deploy failed']);
                    setError(result.error || 'Deploy failed');
                  }
                } catch (err) {
                  setDeployLogs(prev => [...prev, 'Error: ' + err.message]);
                  setError(err.message);
                } finally {
                  setDeploying(false);
                }
              }}
              className="btn-primary w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Shield size={16} />
              {t('identity.deployContract', 'Deploy Smart Contract')}
            </motion.button>
          )}
        </div>
      )}

      {deployDone && (
        <div
          className="p-4 rounded-xl border mb-4 flex items-center gap-3"
          style={{ borderColor: 'var(--color-success)', backgroundColor: 'rgba(34,197,94,0.08)' }}
        >
          <CheckCircle size={20} style={{ color: 'var(--color-success)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
            {t('identity.deploySuccess', 'Smart contract deployed! Reloading...')}
          </span>
        </div>
      )}

      <h2 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
        {t('identity.chooseUsername')}
      </h2>
      <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
        {t('identity.usernameLinkedNew', 'This username will be registered on the IOTA blockchain, linked to your wallet address.')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="relative">
            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('identity.usernamePlaceholder')}
              maxLength={20}
              className="w-full pl-10 pr-4 py-3 rounded-xl border bg-transparent outline-none transition-colors"
              style={{
                borderColor: username && !isValid ? 'var(--color-danger)' : 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
              onBlur={(e) => (e.target.style.borderColor = username && !isValid ? 'var(--color-danger)' : 'var(--color-border)')}
            />
          </div>
          <p className="text-xs mt-1.5" style={{ color: username && !isValid ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
            {t('identity.usernameRules')}
          </p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-danger)' }}>
            <AlertTriangle size={16} />
            {error}
          </motion.div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={!isValid || submitting}
          className="btn-primary w-full py-3 rounded-xl font-semibold disabled:opacity-40"
        >
          {submitting ? t('identity.registering') : t('identity.register')}
        </motion.button>
      </form>

      <button
        onClick={onLock}
        className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <Lock size={16} />
        {t('identity.lockWallet', 'Lock Wallet')}
      </button>
    </motion.div>
  );
}

// ─── State 4: Fully registered ──────────────────────────────────────────────

function RegisteredCard({ identity, onExportMnemonic, onImport, onGenerate, onClear, onLock, postEvent }) {
  const { t } = useTranslation();
  const { balanceFormatted, requestFaucet, refreshBalance } = useWallet();
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showUsername, setShowUsername] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportMnemonic, setExportMnemonic] = useState(null);
  const [exportError, setExportError] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetDone, setFaucetDone] = useState(false);

  // Fetch current privacy setting
  useEffect(() => {
    if (identity?.address) {
      fetch(`/api/v1/user/${identity.address}`)
        .then((r) => r.json())
        .then((d) => { if (d.user) setShowUsername(!!d.user.showUsername); })
        .catch(() => {});
    }
  }, [identity?.address]);

  async function togglePrivacy() {
    setPrivacyLoading(true);
    try {
      const newVal = !showUsername;
      await postEvent('FORUM_USER', identity.address, {
        id: identity.address,
        username: identity.username,
        showUsername: newVal,
        createdAt: Date.now(),
      }, 2);
      setShowUsername(newVal);
    } catch (e) {
      console.error('[Identity] Privacy toggle error:', e);
    } finally {
      setPrivacyLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(identity.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    onClear();
    setConfirmReset(false);
  }

  async function handleExport() {
    if (!exportPassword) return;
    setExportError('');
    try {
      const mnemonic = await onExportMnemonic(exportPassword);
      setExportMnemonic(mnemonic);
    } catch (err) {
      setExportError(t('identity.wrongPassword', 'Wrong password'));
    }
  }

  async function handleFaucet() {
    setFaucetLoading(true);
    try {
      await requestFaucet();
      setFaucetDone(true);
      setTimeout(() => setFaucetDone(false), 5000);
    } catch {
      // ignore
    } finally {
      setFaucetLoading(false);
    }
  }

  return (
    <motion.div {...fadeSlide} className="space-y-4">
      {/* Profile card */}
      <div className="glass-card">
        <div className="flex items-center gap-4 mb-5">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}
          >
            {identity.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{identity.username}</h2>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {identity.address}
              </span>
              <button
                onClick={handleCopy}
                className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                title={t('identity.copyAddress', 'Copy address')}
              >
                {copied ? (
                  <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                ) : (
                  <Copy size={14} style={{ color: 'var(--color-text-muted)' }} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Balance */}
        <div className="flex items-center justify-between p-3 rounded-xl mb-3" style={{ background: 'var(--color-surface)' }}>
          <div className="flex items-center gap-2">
            <Wallet size={16} style={{ color: 'var(--color-primary)' }} />
            <span className="font-mono font-bold text-lg">{balanceFormatted}</span>
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>IOTA</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleFaucet}
              disabled={faucetLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: faucetDone ? 'rgba(34, 197, 94, 0.15)' : 'rgba(var(--color-primary-rgb, 0, 240, 255), 0.1)',
                color: faucetDone ? 'var(--color-success)' : 'var(--color-primary)',
              }}
            >
              {faucetLoading ? <Loader2 size={12} className="animate-spin" /> : faucetDone ? <CheckCircle size={12} /> : <Droplets size={12} />}
              {faucetDone ? t('identity.faucetSent', 'Sent!') : t('identity.requestGas', 'Get Gas')}
            </button>
            <button
              onClick={refreshBalance}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Privacy toggle */}
        <div className="pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={togglePrivacy}
            disabled={privacyLoading}
            className="flex items-center justify-between w-full py-2 px-3 rounded-lg hover:bg-white/5 transition-colors text-sm"
          >
            <div className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
              {showUsername ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>
                {showUsername
                  ? <>{t('identity.usernameVisible')} <strong style={{ color: 'var(--color-success)' }}></strong></>
                  : <>{t('identity.usernameHidden')} &mdash; {t('identity.shownAs')} {identity.address?.slice(0, 12)}...</>
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              {privacyLoading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-primary)' }} />}
              <div
                className="w-10 h-5 rounded-full transition-colors relative"
                style={{ backgroundColor: showUsername ? 'var(--color-success)' : 'var(--color-border)' }}
              >
                <motion.div
                  animate={{ x: showUsername ? 20 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="w-4 h-4 rounded-full bg-white absolute top-0.5"
                />
              </div>
            </div>
          </button>
          <p className="text-xs mt-1 px-3" style={{ color: 'var(--color-text-muted)' }}>
            {t('identity.privacyNote')}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="glass-card space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>
          {t('identity.actions', 'Actions')}
        </h3>

        {/* Export mnemonic */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => { setShowExport(!showExport); setExportMnemonic(null); setExportError(''); setExportPassword(''); }}
          className="flex items-center gap-3 w-full py-2.5 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
        >
          <Download size={18} style={{ color: 'var(--color-primary)' }} />
          <div className="text-left">
            <p className="text-sm font-medium">{t('identity.exportMnemonic', 'Export Recovery Phrase')}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('identity.exportMnemonicDesc', 'Show your 12-word recovery phrase (requires password)')}</p>
          </div>
          {showExport ? <ChevronUp size={16} className="ml-auto" style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={16} className="ml-auto" style={{ color: 'var(--color-text-muted)' }} />}
        </motion.button>

        <AnimatePresence>
          {showExport && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-3">
                {!exportMnemonic ? (
                  <>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
                      <input
                        type="password"
                        value={exportPassword}
                        onChange={(e) => setExportPassword(e.target.value)}
                        placeholder={t('identity.enterPassword', 'Enter your password')}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border bg-transparent outline-none text-sm"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleExport()}
                      />
                    </div>
                    {exportError && (
                      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--color-danger)' }}>
                        <AlertTriangle size={12} /> {exportError}
                      </p>
                    )}
                    <button
                      onClick={handleExport}
                      disabled={!exportPassword}
                      className="btn-primary w-full py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                    >
                      {t('identity.showPhrase', 'Show Recovery Phrase')}
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      className="grid grid-cols-3 gap-2 p-3 rounded-xl"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                    >
                      {exportMnemonic.split(' ').map((word, i) => (
                        <div key={i} className="flex items-center gap-1.5 py-1 px-2 rounded-lg" style={{ background: 'var(--color-bg)' }}>
                          <span className="text-xs font-mono w-4 text-right" style={{ color: 'var(--color-text-muted)' }}>{i + 1}</span>
                          <span className="text-xs font-mono font-medium">{word}</span>
                        </div>
                      ))}
                    </div>
                    <CopyButton text={exportMnemonic} label={t('identity.copyMnemonic', 'Copy to clipboard')} />
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lock wallet */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onLock}
          className="flex items-center gap-3 w-full py-2.5 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
        >
          <LogOut size={18} style={{ color: 'var(--color-secondary)' }} />
          <div className="text-left">
            <p className="text-sm font-medium">{t('identity.lockWallet', 'Lock Wallet')}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('identity.lockDesc', 'Clear keypair from memory, requires password to unlock again')}</p>
          </div>
        </motion.button>

        {/* Reset identity */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleReset}
          className="flex items-center gap-3 w-full py-2.5 px-4 rounded-xl border transition-colors"
          style={{
            borderColor: confirmReset ? 'var(--color-danger)' : 'rgba(255,255,255,0.1)',
            backgroundColor: confirmReset ? 'rgba(255,68,68,0.1)' : 'transparent',
          }}
        >
          <AlertTriangle size={18} style={{ color: 'var(--color-danger)' }} />
          <div className="text-left">
            <p className="text-sm font-medium" style={{ color: confirmReset ? 'var(--color-danger)' : undefined }}>
              {confirmReset ? t('identity.confirmIrreversible') : t('identity.generateNew')}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {confirmReset ? t('identity.currentWillBeLost') : t('identity.generateNewDesc')}
            </p>
          </div>
        </motion.button>
      </div>

      {/* Activity */}
      <div className="glass-card">
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-muted)' }}>
          {t('identity.activity')}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: t('admin.threads', 'Threads'), value: '--' },
            { label: t('admin.posts', 'Posts'), value: '--' },
            { label: t('identity.reputation'), value: '--' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>{stat.value}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Shared: Copy button ────────────────────────────────────────────────────

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm"
      style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}
    >
      {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}
