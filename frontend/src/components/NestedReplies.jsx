import PostCard from './PostCard';

const MAX_DEPTH = 5;

export default function NestedReplies({
  posts,
  parentId = null,
  depth = 0,
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
  freshPostIds,
  layout,
  onReact,
}) {
  if (!posts || posts.length === 0) return null;

  const children = posts.filter((p) => (p.parentId || null) === parentId);
  if (children.length === 0) return null;

  const renderFlat = depth >= MAX_DEPTH;

  return (
    <div
      className="space-y-3"
      style={{
        marginLeft: depth > 0 && !renderFlat ? Math.min(depth * 20, 80) : 0,
        borderLeft: depth > 0 && !renderFlat ? '1px solid var(--color-border)' : 'none',
        paddingLeft: depth > 0 && !renderFlat ? 12 : 0,
      }}
    >
      {children.map((post) => (
        <div key={post.id}>
          <PostCard
            post={post}
            onReply={onReply}
            onVote={onVote}
            onEdit={onEdit}
            onModerate={onModerate}
            currentUserId={currentUserId}
            userRole={userRole}
            threadLocked={threadLocked}
            onShowHistory={onShowHistory}
            replyToId={replyToId}
            onSubmitReply={onSubmitReply}
            onCancelReply={onCancelReply}
            isFresh={freshPostIds?.has(post.id)}
            layout={layout}
            onReact={onReact}
          />
          <NestedReplies
            posts={posts}
            parentId={post.id}
            depth={renderFlat ? depth : depth + 1}
            onReply={onReply}
            onVote={onVote}
            onEdit={onEdit}
            onModerate={onModerate}
            currentUserId={currentUserId}
            userRole={userRole}
            threadLocked={threadLocked}
            onShowHistory={onShowHistory}
            replyToId={replyToId}
            onSubmitReply={onSubmitReply}
            onCancelReply={onCancelReply}
            freshPostIds={freshPostIds}
            layout={layout}
            onReact={onReact}
          />
        </div>
      ))}
    </div>
  );
}
