import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { useIdentity } from '../hooks/useIdentity';
import { useTranslation } from 'react-i18next';

/**
 * Button to start a DM conversation with a user.
 * Shows on user profiles and post cards.
 *
 * @param {string} userId - The target user's IOTA address
 * @param {string} [variant='icon'] - 'icon' for compact, 'button' for full button
 * @param {string} [className] - Additional CSS classes
 */
export default function DMButton({ userId, variant = 'icon', className = '' }) {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const navigate = useNavigate();

  // Don't show button if not logged in or if it's the current user
  if (!identity?.address || identity.address === userId) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    navigate(`/messages?to=${userId}`);
  };

  if (variant === 'button') {
    return (
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleClick}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all hover:bg-white/5 ${className}`}
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-primary)',
        }}
      >
        <MessageSquare size={14} />
        {t('dm.send', 'Message')}
      </motion.button>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={handleClick}
      title={t('dm.send', 'Message')}
      className={`p-1.5 rounded-lg transition-all hover:bg-white/5 ${className}`}
      style={{ color: 'var(--color-text-muted)' }}
    >
      <MessageSquare size={16} />
    </motion.button>
  );
}
