import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { api } from '../api/endpoints';
import { useIdentity } from '../hooks/useIdentity';
import { useTranslation } from 'react-i18next';

const EMOJI_SET = [
  '\u{1F44D}', '\u{1F44E}', '\u{2764}\u{FE0F}', '\u{1F525}', '\u{1F389}',
  '\u{1F602}', '\u{1F62E}', '\u{1F914}', '\u{1F4AF}', '\u{1F44F}',
  '\u{1F680}', '\u{2705}', '\u{274C}', '\u{1F440}', '\u{1F4A1}',
  '\u{2B50}', '\u{1F31F}', '\u{1F4AA}', '\u{1F64F}', '\u{1F308}',
  '\u{1F3C6}', '\u{1F48E}', '\u{26A1}', '\u{1F381}',
];

export default function ReactionBar({ postId, onReact }) {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const [reactions, setReactions] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);
  const userId = identity?.userId;

  const fetchReactions = useCallback(async () => {
    try {
      const res = await api.getReactions(postId);
      if (res.success) setReactions(res.reactions || []);
    } catch { /* ignore */ }
  }, [postId]);

  useEffect(() => { fetchReactions(); }, [fetchReactions]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  async function handleReaction(emoji) {
    if (!userId || !onReact) return;
    setShowPicker(false);

    // Optimistic update
    const existing = reactions.find((r) => r.emoji === emoji);
    const userReacted = existing?.users?.some((u) => u.userId === userId);

    if (userReacted) {
      // Remove
      setReactions((prev) =>
        prev
          .map((r) =>
            r.emoji === emoji
              ? { ...r, count: r.count - 1, users: r.users.filter((u) => u.userId !== userId) }
              : r
          )
          .filter((r) => r.count > 0)
      );
      await onReact(postId, emoji, 'remove');
    } else {
      // Add
      if (existing) {
        setReactions((prev) =>
          prev.map((r) =>
            r.emoji === emoji
              ? { ...r, count: r.count + 1, users: [...r.users, { userId, username: identity?.username }] }
              : r
          )
        );
      } else {
        setReactions((prev) => [
          ...prev,
          { emoji, count: 1, users: [{ userId, username: identity?.username }] },
        ]);
      }
      await onReact(postId, emoji, 'add');
    }

    // Refresh from server after a short delay
    setTimeout(fetchReactions, 1000);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <AnimatePresence>
        {reactions.map((r) => {
          const userReacted = r.users?.some((u) => u.userId === userId);
          return (
            <motion.button
              key={r.emoji}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleReaction(r.emoji)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all cursor-pointer"
              style={{
                background: userReacted ? 'rgba(0,240,255,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${userReacted ? 'var(--color-primary)' : 'var(--color-border)'}`,
                color: userReacted ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
              title={r.users?.map((u) => u.username || u.userId?.slice(0, 8)).join(', ')}
            >
              <span className="text-sm">{r.emoji}</span>
              <span className="font-medium">{r.count}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>

      {/* Add reaction button */}
      {userId && (
        <div className="relative" ref={pickerRef}>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowPicker((p) => !p)}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer"
            style={{
              background: showPicker ? 'rgba(0,240,255,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showPicker ? 'var(--color-primary)' : 'var(--color-border)'}`,
              color: showPicker ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
            title={t('reactions.addReaction')}
          >
            <Plus size={14} />
          </motion.button>

          <AnimatePresence>
            {showPicker && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 8 }}
                className="absolute bottom-full mb-2 left-0 z-50 p-2 rounded-xl border shadow-lg"
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(16px)',
                }}
              >
                <div className="grid grid-cols-8 gap-1 w-max">
                  {EMOJI_SET.map((emoji) => (
                    <motion.button
                      key={emoji}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => handleReaction(emoji)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-lg transition-colors cursor-pointer"
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
