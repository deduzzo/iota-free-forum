import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useIdentity } from '../hooks/useIdentity';

const REMEMBER_KEY = 'wallet_remember';
const REMEMBER_PW_KEY = 'wallet_remember_pw';

/**
 * Wraps children and shows an unlock prompt if the wallet is locked.
 * - If the user has NO wallet (guest), passes children directly without blocking.
 * - If "remember me" was set, attempts auto-unlock with saved password.
 * - Adds a "Remember me on this device" checkbox that saves to sessionStorage.
 */
export default function UnlockGuard({ children }) {
  const { t } = useTranslation();
  const { identity, unlocked, unlockIdentity } = useIdentity();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [autoUnlockAttempted, setAutoUnlockAttempted] = useState(false);

  // Auto-unlock when "remember me" is active and wallet is locked
  useEffect(() => {
    if (!identity || unlocked || autoUnlockAttempted) return;
    const savedPw = sessionStorage.getItem(REMEMBER_PW_KEY);
    if (sessionStorage.getItem(REMEMBER_KEY) === 'true' && savedPw) {
      setAutoUnlockAttempted(true);
      unlockIdentity(savedPw).catch(() => {
        // Password invalid — clear remembered state, show form
        sessionStorage.removeItem(REMEMBER_KEY);
        sessionStorage.removeItem(REMEMBER_PW_KEY);
      });
    } else {
      setAutoUnlockAttempted(true);
    }
  }, [identity, unlocked, autoUnlockAttempted, unlockIdentity]);

  // If user has no wallet (guest), pass through directly
  if (!identity) return children;

  // Already unlocked — render children
  if (unlocked) return children;

  // Auto-unlock in progress — show spinner
  if (!autoUnlockAttempted) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card text-center"
      >
        <Lock size={40} className="mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
        <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          {t('identity.unlockTitle', 'Sblocca il wallet')}
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('identity.unlockDesc', 'Inserisci la password per firmare transazioni on-chain.')}
        </p>
        <form onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError('');
          try {
            await unlockIdentity(password);
            if (rememberMe) {
              sessionStorage.setItem(REMEMBER_KEY, 'true');
              sessionStorage.setItem(REMEMBER_PW_KEY, password);
            }
          } catch {
            setError(t('identity.wrongPassword', 'Password errata'));
          } finally {
            setLoading(false);
          }
        }}>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder={t('identity.passwordPlaceholder', 'Password wallet')}
            className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm outline-none mb-3"
            style={{
              borderColor: error ? 'var(--color-danger)' : 'var(--color-border)',
              color: 'var(--color-text)',
            }}
            autoFocus
          />
          {error && <p className="text-xs mb-3" style={{ color: 'var(--color-danger)' }}>{error}</p>}

          {/* Remember me checkbox */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer justify-center">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border accent-[var(--color-primary)]"
              style={{ accentColor: 'var(--color-primary)' }}
            />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('identity.rememberMe', 'Ricordami su questo dispositivo')}
            </span>
          </label>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading || !password}
            className="btn-primary w-full py-2.5 rounded-xl font-semibold disabled:opacity-40"
          >
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('identity.unlockButton', 'Sblocca')}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
