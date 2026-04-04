/**
 * api-search.js — Full-text search on threads and posts using SQLite FTS5.
 *
 * Updated to handle both IOTA addresses (0x...) and legacy USR_ IDs.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API Search',
  description: 'Full-text search on threads and posts using SQLite FTS5.',

  inputs: {
    q: { type: 'string', required: true },
  },

  exits: {
    success: { statusCode: 200 },
    badRequest: { statusCode: 400 },
  },

  fn: async function (inputs) {
    try {
      const query = inputs.q.trim();
      if (!query || query.length < 2) {
        this.res.status(400);
        return { success: false, error: 'Query must be at least 2 characters' };
      }

      // Sanitize FTS5 query (escape special chars)
      const sanitized = query.replace(/['"]/g, '').replace(/[^\w\s*-]/g, '');
      if (!sanitized) {
        return { success: true, results: [] };
      }

      const results = db.searchFts(sanitized);

      // Enrich results with entity type and details
      const Users = db.getModel('users');
      const Threads = db.getModel('threads');
      const Posts = db.getModel('posts');

      const enriched = results.map(r => {
        const id = r.entityId;
        let type = 'unknown';
        let extra = {};

        if (id.startsWith('THR_')) {
          type = 'thread';
          const thread = Threads.findOne({ id });
          if (!thread || thread.hidden === 1) return null; // Skip hidden threads
          const author = Users.findOne({ id: thread.authorId });
          extra = {
            categoryId: thread.categoryId,
            authorUsername: (author?.showUsername) ? author.username : null,
            authorShowUsername: author?.showUsername || 0,
            createdAt: thread.createdAt,
          };
        } else if (id.startsWith('POST_')) {
          type = 'post';
          const post = Posts.findOne({ id });
          if (!post || post.hidden === 1) return null; // Skip hidden posts
          // Also check if parent thread is hidden
          const parentThread = Threads.findOne({ id: post.threadId });
          if (parentThread && parentThread.hidden === 1) return null;
          const author = Users.findOne({ id: post.authorId });
          extra = {
            threadId: post.threadId,
            authorUsername: (author?.showUsername) ? author.username : null,
            authorShowUsername: author?.showUsername || 0,
            createdAt: post.createdAt,
          };
        } else if (id.startsWith('USR_') || id.startsWith('0x')) {
          // User IDs can be legacy USR_ format or new IOTA addresses (0x...)
          type = 'user';
          const user = Users.findOne({ id });
          if (user) {
            extra = {
              username: user.showUsername ? user.username : null,
              showUsername: user.showUsername || 0,
            };
          }
        }

        return {
          entityId: id,
          type,
          title: r.title,
          content: r.content?.substring(0, 200) || '',
          ...extra,
        };
      }).filter(Boolean); // Remove hidden content entries

      return { success: true, results: enriched, query };
    } catch (err) {
      sails.log.error('[api-search]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
