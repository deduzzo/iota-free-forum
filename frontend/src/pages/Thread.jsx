import { useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Clock, Edit3, Lock, History, Save, X, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { useRealtimeUpdate } from '../hooks/useWebSocket';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api/endpoints';
import { useIdentity } from '../hooks/useIdentity';
import { useToast } from '../components/Layout';
import PostCard from '../components/PostCard';
import NestedReplies from '../components/NestedReplies';
import RichEditor from '../components/RichEditor';
import MarkdownRender from '../components/MarkdownRender';
import VoteButtons from '../components/VoteButtons';
import IdentityBadge from '../components/IdentityBadge';
import BlockchainInfo from '../components/BlockchainInfo';
import EditHistory from '../components/EditHistory';
import LoadingSpinner from '../components/LoadingSpinner';

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString();
}

export default function Thread() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { identity, postEvent } = useIdentity();
  const { addToast } = useToast();
  const { activeThemeId } = useTheme();

  // Get current user's role for moderation
  const { data: userProfile } = useApi(
    () => identity?.userId ? api.getUser(identity.userId) : Promise.resolve(null),
    [identity?.userId],
    ['user'],
  );
  const userRole = userProfile?.user?.role || 'user';
  const isInvisionLayout = activeThemeId?.startsWith('invision');

  // Non passiamo realtimeEntities — gestiamo noi gli aggiornamenti granulari
  const { data, loading, error, setData } = useApi(
    () => api.getThread(id),
    [id],
  );

  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyToId, setReplyToId] = useState(null);

  // IDs dei post appena aggiunti (per highlight visivo)
  const [freshPostIds, setFreshPostIds] = useState(new Set());
  const freshTimers = useRef({});

  // Show hidden posts toggle
  const [showHidden, setShowHidden] = useState(false);

  // Edit OP state
  const [editingOP, setEditingOP] = useState(false);
  const [editOPContent, setEditOPContent] = useState('');
  const [editOPSubmitting, setEditOPSubmitting] = useState(false);

  /* Edit history modal */
  const [historyTarget, setHistoryTarget] = useState(null);

  const thread = data?.thread || data;
  const allPosts = data?.posts || thread?.posts || [];
  const posts = showHidden ? allPosts : allPosts.filter(p => !p.hidden);
  const hiddenCount = allPosts.filter(p => p.hidden).length;

  // Segna un post come "fresh" per 3 secondi (feedback visivo)
  const markFresh = useCallback((postId) => {
    setFreshPostIds((prev) => new Set(prev).add(postId));
    clearTimeout(freshTimers.current[postId]);
    freshTimers.current[postId] = setTimeout(() => {
      setFreshPostIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
      delete freshTimers.current[postId];
    }, 3000);
  }, []);

  // WebSocket: aggiornamento granulare per post in questo thread
  useRealtimeUpdate(
    useCallback(
      (wsData) => {
        if (!data) return;

        if (
          (wsData.action === 'postCreated' || wsData.action === 'postEdited') &&
          wsData.threadId === id
        ) {
          // Fetch solo i dati del thread aggiornato (non reload pagina intera)
          api.getThread(id).then((fresh) => {
            if (!fresh) return;
            const freshThread = fresh.thread || fresh;
            const freshPosts = fresh.posts || freshThread?.posts || [];

            setData((prev) => {
              const prevThread = prev?.thread || prev;
              const prevPosts = prev?.posts || prevThread?.posts || [];
              const prevIds = new Set(prevPosts.map((p) => p.id));

              // Trova nuovi post per highlight
              freshPosts.forEach((p) => {
                if (!prevIds.has(p.id)) {
                  markFresh(p.id);
                }
              });

              return fresh;
            });
          });
        }

        if (wsData.action === 'voted' && wsData.postId) {
          // Aggiorna solo lo score del post specifico
          setData((prev) => {
            if (!prev) return prev;
            const prevThread = prev.thread || prev;
            const prevPosts = prev.posts || prevThread?.posts || [];

            const updatedPosts = prevPosts.map((p) =>
              p.id === wsData.postId ? { ...p, score: wsData.score ?? p.score } : p,
            );

            if (prev.posts) {
              return { ...prev, posts: updatedPosts };
            }
            return { ...prev, thread: { ...prevThread, posts: updatedPosts } };
          });
        }

        if (wsData.action === 'threadEdited' && wsData.threadId === id) {
          api.getThread(id).then((fresh) => {
            if (fresh) setData(fresh);
          });
        }

        if (wsData.action === 'threadModerated' && wsData.threadId === id) {
          api.getThread(id).then((fresh) => {
            if (fresh) setData(fresh);
          });
        }

        // Utente aggiornato (es. cambio showUsername) — refresh per aggiornare nomi autori
        if (wsData.entity === 'user' && wsData.action === 'userUpdated') {
          api.getThread(id).then((fresh) => {
            if (fresh) setData(fresh);
          });
        }
      },
      [id, data, markFresh, setData],
    ),
    ['post', 'thread', 'user'],
  );

  const handleVote = useCallback(
    async (postId, direction) => {
      if (!identity) return;
      try {
        const voteId = `VOTE_${Date.now().toString(36).toUpperCase()}`;
        const result = await postEvent('FORUM_VOTE', voteId, {
          id: voteId,
          postId,
          vote: direction,
          createdAt: Date.now(),
        }, 1);

        // Optimistic update dello score
        if (result.effects?.status?.status === 'success') {
          setData((prev) => {
            if (!prev) return prev;
            const prevThread = prev.thread || prev;
            const prevPosts = prev.posts || prevThread?.posts || [];

            const updatedPosts = prevPosts.map((p) =>
              p.id === postId
                ? { ...p, userVote: direction }
                : p,
            );

            if (prev.posts) {
              return { ...prev, posts: updatedPosts };
            }
            return { ...prev, thread: { ...prevThread, posts: updatedPosts } };
          });
        }
      } catch (err) {
        console.error('Vote failed:', err);
      }
    },
    [identity, postEvent, setData],
  );

  const handleReply = useCallback(
    async (parentId) => {
      setReplyToId(parentId);
    },
    [],
  );

  const submitReply = useCallback(
    async (content, parentId = null) => {
      if (!identity || !content.trim()) return;
      setSubmitting(true);
      try {
        const postId = `POST_${Date.now().toString(36).toUpperCase()}`;
        const result = await postEvent('FORUM_POST', postId, {
          id: postId,
          threadId: id,
          parentId: parentId || null,
          content: content.trim(),
          createdAt: Date.now(),
        }, 1);

        if (result.effects?.status?.status !== 'success') {
          throw new Error('Failed to post');
        }

        // Optimistic update: aggiungi il post allo state locale
        const newPost = {
          id: postId,
          threadId: id,
          parentId: parentId || null,
          content: content.trim(),
          authorId: identity.userId,
          authorUsername: identity.username,
          authorShowUsername: identity.username ? 1 : 0,
          hidden: 0,
          version: 1,
          score: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          children: [],
        };

        setData((prev) => {
          if (!prev) return prev;
          const prevThread = prev.thread || prev;
          const prevPosts = prev.posts || prevThread?.posts || [];

          const updatedPosts = [...prevPosts, newPost];
          const updatedThread = {
            ...prevThread,
            postCount: (prevThread.postCount || 0) + 1,
            lastPostAt: Date.now(),
          };

          if (prev.posts !== undefined) {
            return { ...prev, thread: updatedThread, posts: updatedPosts };
          }
          return { ...prev, thread: { ...updatedThread, posts: updatedPosts } };
        });

        // Highlight il nuovo post
        markFresh(newPost.id);

        setReplyContent('');
        setReplyToId(null);
      } catch (err) {
        console.error('Reply failed:', err);
      } finally {
        setSubmitting(false);
      }
    },
    [identity, postEvent, id, setData, markFresh],
  );

  // Edit a post (called from PostCard)
  const handleEditPost = useCallback(
    async (postId, newContent) => {
      if (!identity) return;
      try {
        // Find current version from local state
        const currentPost = posts.find((p) => p.id === postId);
        const newVersion = (currentPost?.version || 1) + 1;

        const result = await postEvent('FORUM_POST', postId, {
          id: postId,
          threadId: id,
          content: newContent,
          createdAt: currentPost?.createdAt || Date.now(),
        }, newVersion);

        if (result.effects?.status?.status !== 'success') {
          throw new Error('Edit failed');
        }

        // Optimistic update
        setData((prev) => {
          if (!prev) return prev;
          const prevThread = prev.thread || prev;
          const prevPosts = prev.posts || prevThread?.posts || [];
          const updatedPosts = prevPosts.map((p) =>
            p.id === postId ? { ...p, content: newContent, version: newVersion, updatedAt: Date.now() } : p,
          );
          if (prev.posts !== undefined) return { ...prev, posts: updatedPosts };
          return { ...prev, thread: { ...prevThread, posts: updatedPosts } };
        });
      } catch (err) {
        console.error('Edit failed:', err);
      }
    },
    [identity, postEvent, id, posts, setData],
  );

  // Edit OP (thread content)
  const handleEditOP = useCallback(async () => {
    if (!identity || !editOPContent.trim()) return;
    setEditOPSubmitting(true);
    try {
      const newVersion = (thread?.version || 1) + 1;
      const result = await postEvent('FORUM_THREAD', id, {
        id,
        title: thread?.title,
        content: editOPContent.trim(),
        categoryId: thread?.categoryId,
        createdAt: thread?.createdAt || Date.now(),
      }, newVersion);

      if (result.effects?.status?.status !== 'success') {
        throw new Error('Edit failed');
      }

      setData((prev) => {
        if (!prev) return prev;
        const prevThread = prev.thread || prev;
        return { ...prev, thread: { ...prevThread, content: editOPContent.trim(), version: newVersion, updatedAt: Date.now() } };
      });
      setEditingOP(false);
    } catch (err) {
      console.error('Edit OP failed:', err);
    } finally {
      setEditOPSubmitting(false);
    }
  }, [identity, postEvent, id, editOPContent, thread, setData]);

  // Moderate a post (hide/unhide) — requires MODERATOR or ADMIN
  const handleModerate = useCallback(
    async (postId, action) => {
      if (!identity || !postEvent) return;
      try {
        const modId = `MOD_${Date.now().toString(36).toUpperCase()}`;
        await postEvent('FORUM_MODERATION', modId, {
          id: modId,
          postId,
          entityType: 'post',
          action,
          reason: action === 'hide' ? 'Nascosto da moderatore' : 'Ripristinato da moderatore',
          createdAt: Date.now(),
        }, 1);
        addToast(action === 'hide' ? 'Post nascosto' : 'Post ripristinato', 'success');
        // Optimistic update
        setData((prev) => {
          if (!prev) return prev;
          const prevThread = prev.thread || prev;
          const prevPosts = prev.posts || prevThread?.posts || [];
          const updatedPosts = prevPosts.map(p =>
            p.id === postId ? { ...p, hidden: action === 'hide' ? 1 : 0 } : p
          );
          if (prev.posts !== undefined) return { ...prev, posts: updatedPosts };
          return { ...prev, thread: { ...prevThread, posts: updatedPosts } };
        });
      } catch (err) {
        console.error('Moderate failed:', err);
        addToast('Errore moderazione: ' + err.message, 'error');
      }
    },
    [identity, postEvent, addToast, setData],
  );

  // React to a post (emoji reaction via blockchain)
  const handleReact = useCallback(
    async (postId, emoji, action) => {
      if (!identity || !postEvent) return;
      try {
        const reactId = `REACT_${postId}_${identity.userId}_${emoji}`;
        await postEvent('FORUM_REACTION', reactId, {
          id: reactId,
          postId,
          emoji,
          action, // 'add' or 'remove'
          createdAt: Date.now(),
        }, 1);
      } catch (err) {
        console.error('Reaction failed:', err);
      }
    },
    [identity, postEvent],
  );

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

  if (!thread) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p style={{ color: 'var(--color-text-muted)' }}>{t('thread.threadNotFound')}</p>
      </div>
    );
  }

  const isLocked = !!thread.locked;
  const currentUserId = identity?.userId || null;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-2 text-sm mb-4 flex-wrap"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <Link
          to="/"
          className="flex items-center gap-1 hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          <Home size={14} />
          {t('common.home')}
        </Link>
        <span>/</span>
        {thread.categoryId && (
          <>
            <Link
              to={`/c/${thread.categoryId}`}
              className="hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              {thread.categoryName || 'Category'}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="truncate">{thread.title}</span>
      </nav>

      {/* OP (original post) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card mb-6"
      >
        <div className="flex items-start gap-4">
          {/* Votes */}
          <VoteButtons
            postId={thread.id}
            score={thread.score ?? 0}
            userVote={thread.userVote ?? 0}
            onVote={handleVote}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {isLocked && (
                <span
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--color-warning)',
                    color: 'var(--color-background)',
                  }}
                >
                  <Lock size={10} />
                  {t('thread.locked')}
                </span>
              )}
              <h1
                className="text-xl md:text-2xl font-bold"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {thread.title}
              </h1>
            </div>

            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <IdentityBadge
                userId={thread.authorId}
                username={thread.authorUsername || thread.authorName}
                showUsername={!!thread.authorShowUsername}
                size="sm"
              />
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <Clock size={12} />
                {formatDate(thread.createdAt)}
              </span>
              {thread.version > 1 && (
                <button
                  onClick={() =>
                    setHistoryTarget({ entityType: 'thread', entityId: thread.id })
                  }
                  className="flex items-center gap-1 text-xs hover:underline"
                  style={{ color: 'var(--color-warning)' }}
                >
                  <Edit3 size={12} />
                  {t('thread.modified')} {formatDate(thread.updatedAt)}
                </button>
              )}
            </div>

            {/* Content or edit form */}
            {editingOP ? (
              <div className="mb-3">
                <RichEditor value={editOPContent} onChange={setEditOPContent} placeholder={t('thread.editThread')} minHeight="150px" />
                <div className="flex items-center gap-2 mt-2 justify-end">
                  <button onClick={() => setEditingOP(false)}
                    className="px-3 py-1.5 rounded-lg text-xs border transition-colors hover:bg-white/5"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                    <X size={12} className="inline mr-1" />{t('thread.cancel')}
                  </button>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={handleEditOP} disabled={editOPSubmitting || !editOPContent.trim()}
                    className="btn-primary px-4 py-1.5 rounded-lg text-xs disabled:opacity-40">
                    <Save size={12} className="inline mr-1" />{editOPSubmitting ? t('thread.saving') : t('thread.save')}
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="prose-sm">
                <MarkdownRender content={thread.content || ''} />
              </div>
            )}

            {/* Actions: edit, history, blockchain */}
            <div className="mt-4 pt-3 border-t flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--color-border)' }}>
              {currentUserId && currentUserId === thread.authorId && !editingOP && (
                <button
                  onClick={() => { setEditOPContent(thread.content || ''); setEditingOP(true); }}
                  className="flex items-center gap-1 text-xs hover:underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <Edit3 size={12} />
                  {t('thread.edit')}
                </button>
              )}
              <button
                onClick={() => setHistoryTarget({ entityType: 'thread', entityId: thread.id })}
                className="flex items-center gap-1 text-xs hover:underline"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <History size={12} />
                {t('thread.history')}{thread.version > 1 && ` (v${thread.version})`}
              </button>
              <BlockchainInfo entityType="thread" entityId={thread.id} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Replies */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-muted)' }}
          >
            {t('thread.replies', { count: posts.length })}
          </h2>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all"
              style={{
                borderColor: showHidden ? 'var(--color-warning)' : 'var(--color-border)',
                color: showHidden ? 'var(--color-warning)' : 'var(--color-text-muted)',
                backgroundColor: showHidden ? 'rgba(245,158,11,0.08)' : 'transparent',
              }}
            >
              {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
              {showHidden
                ? t('thread.hideHidden', `Nascondi moderati (${hiddenCount})`)
                : t('thread.showHidden', `Mostra moderati (${hiddenCount})`)}
            </button>
          )}
        </div>

        <NestedReplies
          posts={posts}
          parentId={null}
          depth={0}
          onReply={handleReply}
          onVote={handleVote}
          onEdit={handleEditPost}
          onModerate={handleModerate}
          currentUserId={currentUserId}
          userRole={userRole}
          threadLocked={isLocked}
          onShowHistory={(entityId) =>
            setHistoryTarget({ entityType: 'post', entityId })
          }
          replyToId={replyToId}
          onSubmitReply={submitReply}
          onCancelReply={() => setReplyToId(null)}
          freshPostIds={freshPostIds}
          layout={isInvisionLayout ? 'table' : 'cards'}
          onReact={handleReact}
        />
      </div>

      {/* Reply form (top-level) */}
      {identity && !isLocked && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card"
        >
          <h3
            className="text-sm font-semibold mb-3"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('thread.postReply')}
          </h3>
          <RichEditor
            value={replyContent}
            onChange={setReplyContent}
            placeholder={t('thread.writeReply')}
          />
          <div className="flex justify-end mt-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => submitReply(replyContent)}
              disabled={submitting || !replyContent.trim()}
              className="btn-primary px-5 py-2 rounded-xl text-sm disabled:opacity-40"
            >
              {submitting ? t('thread.postingReply') : t('thread.postReply')}
            </motion.button>
          </div>
        </motion.div>
      )}

      {isLocked && (
        <div
          className="glass-card text-center text-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <Lock size={18} className="inline mr-2" />
          {t('thread.threadLocked')}
        </div>
      )}

      {/* Edit history modal */}
      {historyTarget && (
        <EditHistory
          entityType={historyTarget.entityType}
          entityId={historyTarget.entityId}
          isOpen={true}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
