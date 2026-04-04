import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useIdentity } from '../hooks/useIdentity';
import { api } from '../api/endpoints';
import { useTranslation } from 'react-i18next';

/**
 * Follow/Unfollow button for user profiles.
 * Calls on-chain follow/unfollow via useWallet.
 * Does not render on own profile.
 */
export default function FollowButton({ targetUserId }) {
  const { t } = useTranslation();
  const { identity, unlocked } = useIdentity();
  const { followUser, unfollowUser } = useWallet();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const isOwnProfile = identity?.userId === targetUserId;

  // Check if we are already following this user
  useEffect(() => {
    if (!identity?.userId || !targetUserId || isOwnProfile) {
      setChecking(false);
      return;
    }

    setChecking(true);
    api.getFollowing(identity.userId)
      .then((res) => {
        if (res.success && res.users) {
          const found = res.users.some((u) => u.userId === targetUserId);
          setIsFollowing(found);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [identity?.userId, targetUserId, isOwnProfile]);

  if (isOwnProfile || !identity || !unlocked) return null;

  async function handleToggle() {
    if (loading) return;
    setLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(targetUserId);
        setIsFollowing(false);
      } else {
        await followUser(targetUserId);
        setIsFollowing(true);
      }
    } catch (err) {
      console.error('[FollowButton]', err);
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="w-28 h-9 rounded-xl animate-pulse" style={{ background: 'var(--color-border)' }} />
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={handleToggle}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 border disabled:opacity-50"
      style={{
        background: isFollowing
          ? 'transparent'
          : 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
        borderColor: isFollowing ? 'var(--color-border)' : 'transparent',
        color: isFollowing ? 'var(--color-text-muted)' : '#fff',
      }}
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 size={16} className="animate-spin" />
          </motion.span>
        ) : isFollowing ? (
          <motion.span key="following" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <UserCheck size={16} />
          </motion.span>
        ) : (
          <motion.span key="follow" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <UserPlus size={16} />
          </motion.span>
        )}
      </AnimatePresence>
      {isFollowing ? t('social.following', 'Following') : t('social.follow', 'Follow')}
    </motion.button>
  );
}
