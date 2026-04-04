import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Edit3, Clock, History, Save, X, Quote, Shield, EyeOff, Eye, Trash2 } from 'lucide-react';
import IdentityBadge from './IdentityBadge';
import MarkdownRender from './MarkdownRender';
import RichEditor from './RichEditor';
import VoteButtons from './VoteButtons';
import TipButton from './TipButton';
import ReactionBar from './ReactionBar';
import BlockchainInfo from './BlockchainInfo';
import { useTranslation } from 'react-i18next';

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleString();
}

function avatarGradient(userId) {
  let hash = 0;
  for (let i = 0; i < (userId || '').length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 65%, 50%)`;
}

export default function PostCard({
  post,
  onReply,
  onVote,
  onEdit,
  onModerate,
  currentUserId,
  userRole,
  threadLocked,
  onShowHistory,
  replyToId,
  onSubmitReply,
  onCancelReply,
  isFresh,
  layout = 'cards',
  onReact,
}) {
  const { t } = useTranslation();
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isReplying = replyToId === post.id;

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isAuthor = currentUserId && currentUserId === post.authorId;
  const isMod = userRole === 'moderator' || userRole === 'admin';
  const canEdit = isAuthor || isMod;

  async function handleSubmitInlineReply() {
    if (!replyContent.trim()) return;
    setSubmitting(true);
    try {
      await onSubmitReply(replyContent, post.id);
      setReplyContent('');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit() {
    setEditContent(post.content || '');
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!editContent.trim() || editContent.trim() === post.content) {
      setEditing(false);
      return;
    }
    setEditSubmitting(true);
    try {
      if (onEdit) await onEdit(post.id, editContent.trim());
      setEditing(false);
    } finally {
      setEditSubmitting(false);
    }
  }

  /* ── Edit / Reply shared UI ── */
  const editForm = editing && (
    <div className="mb-3">
      <RichEditor value={editContent} onChange={setEditContent} placeholder={t('post.editPost')} minHeight="100px" />
      <div className="flex items-center gap-2 mt-2 justify-end">
        <button onClick={() => setEditing(false)}
          className="px-3 py-1.5 rounded-lg text-xs border transition-colors hover:bg-white/5"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          <X size={12} className="inline mr-1" />{t('post.cancel')}
        </button>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={handleSaveEdit} disabled={editSubmitting || !editContent.trim()}
          className="btn-primary px-4 py-1.5 rounded-lg text-xs disabled:opacity-40">
          <Save size={12} className="inline mr-1" />{editSubmitting ? t('post.saving') : t('post.save')}
        </motion.button>
      </div>
    </div>
  );

  const replyForm = isReplying && (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
      className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
      <RichEditor value={replyContent} onChange={setReplyContent} placeholder={t('post.writeReply')} minHeight="80px" />
      <div className="flex items-center gap-2 mt-2 justify-end">
        <button onClick={onCancelReply}
          className="px-3 py-1.5 rounded-lg text-xs border transition-colors hover:bg-white/5"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>{t('post.cancel')}</button>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={handleSubmitInlineReply} disabled={submitting || !replyContent.trim()}
          className="btn-primary px-4 py-1.5 rounded-lg text-xs disabled:opacity-40">
          {submitting ? t('post.posting') : t('post.reply')}
        </motion.button>
      </div>
    </motion.div>
  );

  const actionButtons = (
    <div className="flex items-center gap-3 flex-wrap">
      {!threadLocked && currentUserId && (
        <button onClick={() => onReply(post.id)}
          className="flex items-center gap-1 text-xs hover:underline transition-colors"
          style={{ color: 'var(--color-primary)' }}>
          <MessageSquare size={12} />{t('post.reply')}
        </button>
      )}
      <TipButton
        postId={post.id}
        authorId={post.authorId}
        tipCount={post.tipCount || 0}
        totalTips={post.totalTips || 0}
      />
      {canEdit && !editing && (
        <button onClick={startEdit}
          className="flex items-center gap-1 text-xs hover:underline transition-colors"
          style={{ color: 'var(--color-text-muted)' }}>
          <Edit3 size={12} />{t('post.edit')}
        </button>
      )}
      {isMod && (
        <button
          onClick={() => onModerate?.(post.id, post.hidden ? 'unhide' : 'hide')}
          className="flex items-center gap-1 text-xs hover:underline transition-colors"
          style={{ color: post.hidden ? 'var(--color-success)' : 'var(--color-danger)' }}
        >
          {post.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
          {post.hidden ? t('post.unhide', 'Mostra') : t('post.hide', 'Nascondi')}
        </button>
      )}
      <button onClick={() => onShowHistory?.(post.id)}
        className="flex items-center gap-1 text-xs hover:underline transition-colors"
        style={{ color: 'var(--color-text-muted)' }}>
        <History size={12} />{t('post.history')}{post.version > 1 && ` (v${post.version})`}
      </button>
      <BlockchainInfo entityType="post" entityId={post.id} />
    </div>
  );

  const reactionBar = (
    <div className="mt-2">
      <ReactionBar postId={post.id} onReact={onReact} />
    </div>
  );

  /* ═════════════════════════════════════════════════════════════════
     INVISION / FORUM LAYOUT — avatar sidebar + content area
     ═════════════════════════════════════════════════════════════════ */
  const isHidden = !!post.hidden;

  if (layout === 'table') {
    const displayName = post.authorUsername || post.authorName || post.authorId?.slice(0, 12);
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl overflow-visible border"
        style={{
          borderColor: isHidden ? 'var(--color-danger)' : isFresh ? 'var(--color-success)' : 'var(--color-border)',
          boxShadow: isFresh ? '0 0 12px rgba(0,255,136,0.15)' : 'var(--shadow-card)',
          opacity: isHidden ? 0.4 : 1,
          transition: 'border-color 0.6s ease, box-shadow 0.6s ease, opacity 0.3s ease',
        }}
      >
        {/* Post header bar */}
        <div className="flex items-center justify-between px-4 py-2 text-xs"
          style={{ background: 'var(--color-primary)', color: 'var(--color-background)' }}>
          <span className="flex items-center gap-1.5">
            <Clock size={12} />
            {formatDate(post.createdAt)}
            {post.version > 1 && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: 'rgba(255,255,255,0.2)' }}>
                v{post.version}
              </span>
            )}
          </span>
          <span className="font-mono opacity-70">{post.id?.slice(0, 12)}</span>
        </div>

        <div className="flex" style={{ background: 'var(--color-surface)' }}>
          {/* ── Left sidebar: author info ── */}
          <div className="w-36 md:w-44 shrink-0 p-4 flex flex-col items-center text-center border-r"
            style={{ borderColor: 'var(--color-border)', background: 'rgba(0,0,0,0.02)' }}>
            {/* Avatar */}
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-2"
              style={{ background: avatarGradient(post.authorId) }}>
              {(post.authorUsername?.[0] || post.authorId?.[4] || '?').toUpperCase()}
            </div>
            {/* Username */}
            <IdentityBadge userId={post.authorId} username={post.authorUsername || post.authorName}
              showUsername={!!post.authorShowUsername} size="sm" />
            {/* Role badge */}
            {post.authorRole && (
              <span className="mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: post.authorRole === 'admin' ? 'var(--color-danger)' :
                    post.authorRole === 'moderator' ? 'var(--color-warning)' : 'var(--color-primary)',
                  color: 'var(--color-background)',
                }}>
                {post.authorRole}
              </span>
            )}
            {/* Stats */}
            <div className="mt-2 text-[11px] space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
              <div>{t('post.registered')} {post.authorJoined ? new Date(post.authorJoined).toLocaleDateString() : '--'}</div>
            </div>
          </div>

          {/* ── Right area: content ── */}
          <div className="flex-1 min-w-0 p-4">
            {editing ? editForm : (
              <div className="mb-3">
                <MarkdownRender content={post.content || ''} />
              </div>
            )}

            {/* Reactions */}
            {reactionBar}

            {/* Actions */}
            <div className="pt-3 mt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                {actionButtons}
                <VoteButtons postId={post.id} score={post.score ?? 0} userVote={post.userVote ?? 0} onVote={onVote} />
              </div>
            </div>

            {replyForm}
          </div>
        </div>
      </motion.div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     DEFAULT CARD LAYOUT
     ═════════════════════════════════════════════════════════════════ */
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-card"
      style={{
        borderLeft: `3px solid ${isHidden ? 'var(--color-danger)' : isFresh ? 'var(--color-success)' : 'var(--color-primary)'}`,
        boxShadow: isFresh ? '0 0 12px rgba(0,255,136,0.15)' : undefined,
        opacity: isHidden ? 0.4 : 1,
        transition: 'border-color 0.6s ease, box-shadow 0.6s ease',
      }}
    >
      <div className="flex gap-3">
        <VoteButtons postId={post.id} score={post.score ?? 0} userVote={post.userVote ?? 0} onVote={onVote} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <IdentityBadge userId={post.authorId} username={post.authorUsername || post.authorName}
              showUsername={!!post.authorShowUsername} size="sm" />
            {isHidden && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(255,68,68,0.15)', color: 'var(--color-danger)' }}>
                <EyeOff size={10} />{t('post.hidden', 'Nascosto')}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <Clock size={12} />{formatDate(post.createdAt)}
            </span>
            {post.version > 1 && (
              <button onClick={() => onShowHistory?.(post.id)}
                className="flex items-center gap-1 text-xs hover:underline"
                style={{ color: 'var(--color-warning)' }}>
                <Edit3 size={12} />v{post.version}
              </button>
            )}
          </div>
          {editing ? editForm : <div className="mb-3"><MarkdownRender content={post.content || ''} /></div>}
          {reactionBar}
          {actionButtons}
          {replyForm}
        </div>
      </div>
    </motion.div>
  );
}
