const db = require('../utility/db');
const iota = require('../utility/iota');
const { verifyAdmin } = require('../utility/authMiddleware');

module.exports = {
  friendlyName: 'Integrity check',
  description: 'Compare local cache counts vs blockchain event counts to detect missing data. Admin only.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      // Auth: only admin can run integrity checks
      const admin = await verifyAdmin(this.req);
      if (!admin) {
        this.res.status(403);
        return { success: false, error: 'Access denied. Admin authentication required.' };
      }
      // Count local cache entries
      const database = db.getDb();
      const local = {
        users: database.prepare('SELECT COUNT(*) as c FROM users').get().c,
        categories: database.prepare('SELECT COUNT(*) as c FROM categories').get().c,
        threads: database.prepare('SELECT COUNT(*) as c FROM threads').get().c,
        posts: database.prepare('SELECT COUNT(*) as c FROM posts').get().c,
        votes: database.prepare('SELECT COUNT(*) as c FROM votes').get().c,
      };

      // Count blockchain events
      let chain = { users: 0, categories: 0, threads: 0, posts: 0, votes: 0, total: 0 };
      let chainDetail = {};
      try {
        const byTag = await iota.queryForumEvents();
        chainDetail = {};
        for (const [tag, events] of Object.entries(byTag)) {
          chainDetail[tag] = events.length;
          chain.total += events.length;
        }
        // Map tags to entity counts (unique entity IDs)
        const uniqueIds = (events) => new Set(events.map(e => e.entityId || e.payload?.id)).size;
        chain.users = uniqueIds(byTag['FORUM_USER'] || []);
        chain.categories = uniqueIds(byTag['FORUM_CATEGORY'] || []);
        chain.threads = uniqueIds(byTag['FORUM_THREAD'] || []);
        chain.posts = uniqueIds(byTag['FORUM_POST'] || []);
        chain.votes = uniqueIds(byTag['FORUM_VOTE'] || []);
      } catch (err) {
        return {
          success: false,
          error: 'Failed to query blockchain: ' + err.message,
          local,
        };
      }

      // Compare
      const mismatches = [];
      for (const key of ['users', 'categories', 'threads', 'posts', 'votes']) {
        if (local[key] !== chain[key]) {
          mismatches.push({
            entity: key,
            local: local[key],
            chain: chain[key],
            diff: chain[key] - local[key],
          });
        }
      }

      const synced = mismatches.length === 0;

      return {
        success: true,
        synced,
        local,
        chain,
        chainEvents: chainDetail,
        mismatches: mismatches.length > 0 ? mismatches : undefined,
        message: synced
          ? 'Cache is in sync with blockchain'
          : `${mismatches.length} mismatch(es) found — run sync-reset to fix`,
      };
    } catch (err) {
      sails.log.error('[integrity-check]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
