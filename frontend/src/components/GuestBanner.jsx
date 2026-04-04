import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const DISMISS_KEY = 'guest_banner_dismissed';

/**
 * Compact glassmorphism banner at the bottom of the page for guests (no wallet).
 * - Dismissible (saved in sessionStorage)
 * - Animated with framer-motion
 * - Links to /identity to create a wallet
 */
export default function GuestBanner({ identityChecked = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem(DISMISS_KEY) === 'true';
  });

  if (dismissed || !identityChecked) return null;

  function handleDismiss() {
    sessionStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg"
        >
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg"
            style={{
              background: 'rgba(var(--color-surface-rgb, 20, 20, 35), 0.85)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderColor: 'rgba(var(--color-primary-rgb, 0, 240, 255), 0.2)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px rgba(var(--color-primary-rgb, 0, 240, 255), 0.08)',
            }}
          >
            {/* Icon */}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              }}
            >
              <Fingerprint size={18} className="text-white" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t('guest.banner.title', 'Want to participate? Create your wallet in 2 minutes')}
              </p>
            </div>

            {/* CTA button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/identity')}
              className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                color: '#fff',
              }}
            >
              {t('guest.banner.cta', 'Create Wallet')}
            </motion.button>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className="shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
