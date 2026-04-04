import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, Calendar, FileText, MessageSquare, Edit3, Save, X,
  Users, UserPlus,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/endpoints';
import { useIdentity } from '../hooks/useIdentity';
import LoadingSpinner from '../components/LoadingSpinner';
import FollowButton from '../components/FollowButton';

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString();
}

function avatarGradient(userId) {
  let hash = 0;
  for (let i = 0; i < (userId || '').length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 80%, 55%), hsl(${h2}, 80%, 45%))`;
}

export default function UserProfile() {
  const { id } = useParams();
  const { identity, postEvent } = useIdentity();
  const isOwnProfile = identity?.userId === id;

  const { data: user, loading, error, reload } = useApi(
    () => api.getUser(id),
    [id],
    ['user'],
  );

  // Follow counts
  const { data: followCounts } = useApi(
    () => api.getFollowCounts(id),
    [id],
    ['follow'],
  );

  // Followers/following lists (for expandable section)
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const { data: followersData } = useApi(
    () => showFollowers ? api.getFollowers(id) : Promise.resolve(null),
    [id, showFollowers],
    ['follow'],
  );
  const { data: followingData } = useApi(
    () => showFollowing ? api.getFollowing(id) : Promise.resolve(null),
    [id, showFollowing],
    ['follow'],
  );

  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setBio(user?.bio || '');
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await postEvent('FORUM_USER', identity.userId, {
        id: identity.userId,
        bio: bio.trim(),
        createdAt: Date.now(),
      }, (user?.version || 1) + 1);

      if (result.effects?.status?.status !== 'success') {
        throw new Error('Failed to save');
      }
      setEditing(false);
      reload();
    } catch (err) {
      console.error('Save profile failed:', err);
    } finally {
      setSaving(false);
    }
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

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p style={{ color: 'var(--color-text-muted)' }}>User not found</p>
      </div>
    );
  }

  const canShowName = isOwnProfile || user.showUsername;
  const displayName = (canShowName && user.username) ? user.username : (id?.slice(0, 12) || '???');
  const initial = (canShowName && user.username ? user.username[0] : id?.[4] || '?').toUpperCase();

  return (
    <div className="max-w-2xl mx-auto">
      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card mb-6"
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold text-white shrink-0"
            style={{ background: avatarGradient(id) }}
          >
            {initial}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1
                className="text-2xl font-bold"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {displayName}
              </h1>
              <FollowButton targetUserId={id} />
            </div>
            <p
              className="font-mono text-xs mb-3 truncate"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {id}
            </p>

            {/* Follower / Following counts */}
            <div className="flex items-center gap-4 text-sm mb-3">
              <button
                onClick={() => { setShowFollowers((v) => !v); setShowFollowing(false); }}
                className="flex items-center gap-1 hover:underline transition-colors"
                style={{ color: 'var(--color-text)' }}
              >
                <span className="font-bold">{followCounts?.followerCount ?? 0}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>Followers</span>
              </button>
              <button
                onClick={() => { setShowFollowing((v) => !v); setShowFollowers(false); }}
                className="flex items-center gap-1 hover:underline transition-colors"
                style={{ color: 'var(--color-text)' }}
              >
                <span className="font-bold">{followCounts?.followingCount ?? 0}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>Following</span>
              </button>
            </div>

            {/* Join date */}
            <div
              className="flex items-center gap-1 text-xs mb-3"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Calendar size={12} />
              Joined {formatDate(user.createdAt)}
            </div>

            {/* Bio */}
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border bg-transparent outline-none text-sm resize-none"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  placeholder="Tell us about yourself..."
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border hover:bg-white/5 transition-colors"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                  >
                    <X size={12} />
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg disabled:opacity-40"
                  >
                    <Save size={12} />
                    {saving ? 'Saving...' : 'Save'}
                  </motion.button>
                </div>
              </div>
            ) : (
              <div>
                {user.bio ? (
                  <p className="text-sm mb-2" style={{ color: 'var(--color-text)' }}>
                    {user.bio}
                  </p>
                ) : (
                  <p className="text-sm italic mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    No bio yet.
                  </p>
                )}
                {isOwnProfile && (
                  <button
                    onClick={startEdit}
                    className="flex items-center gap-1 text-xs hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <Edit3 size={12} />
                    Edit profile
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Followers / Following expandable list */}
      {(showFollowers || showFollowing) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="glass-card mb-6 overflow-hidden"
        >
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Users size={14} />
            {showFollowers ? 'Followers' : 'Following'}
          </h2>
          {(() => {
            const list = showFollowers ? followersData?.users : followingData?.users;
            if (!list || list.length === 0) {
              return (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
                  {showFollowers ? 'No followers yet.' : 'Not following anyone yet.'}
                </p>
              );
            }
            return (
              <div className="space-y-2">
                {list.map((u) => (
                  <Link
                    key={u.userId}
                    to={`/u/${u.userId}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: avatarGradient(u.userId) }}
                    >
                      {((u.showUsername && u.username) ? u.username[0] : u.userId?.[4] || '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                        {(u.showUsername && u.username) ? u.username : u.userId?.slice(0, 12)}
                      </p>
                      <p className="text-xs font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
                        {u.userId?.slice(0, 20)}...
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card mb-6"
      >
        <h2
          className="text-sm font-semibold uppercase tracking-wider mb-4"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Statistics
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <FileText size={16} style={{ color: 'var(--color-primary)' }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
              {user.threadCount ?? '--'}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Threads</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <MessageSquare size={16} style={{ color: 'var(--color-secondary)' }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--color-secondary)' }}>
              {user.postCount ?? '--'}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Posts</p>
          </div>
        </div>
      </motion.div>

      {/* Recent posts placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card"
      >
        <h2
          className="text-sm font-semibold uppercase tracking-wider mb-4"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Recent Activity
        </h2>
        <div className="flex flex-col items-center py-6 gap-2">
          <User size={32} style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Recent posts will appear here.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
