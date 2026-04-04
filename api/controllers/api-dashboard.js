/**
 * api-dashboard.js — Forum statistics dashboard.
 *
 * Includes new payment/marketplace stats alongside existing forum stats.
 */

const db = require('../utility/db');
const cache = require('../utility/cache');

module.exports = {
  friendlyName: 'API Dashboard',
  description: 'Return forum statistics: users, threads, posts, active users, payment stats.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      // Check cache first (TTL 10s)
      const cached = cache.get('dashboard:stats');
      if (cached) return cached;

      const database = db.getDb();
      const Users = db.getModel('users');
      const Threads = db.getModel('threads');
      const Posts = db.getModel('posts');
      const Categories = db.getModel('categories');

      const totalUsers = Users.count();
      const totalThreads = Threads.count();
      const totalPosts = Posts.count();
      const totalCategories = Categories.count();

      // Active users in last 24h — single aggregate query instead of loading 500 rows
      const oneDayAgo = Date.now() - 86400000;
      const activeRow = database.prepare(
        'SELECT COUNT(DISTINCT authorId) as cnt FROM posts WHERE createdAt > ?'
      ).get(oneDayAgo);

      // Latest threads (enriched with author info + privacy via JOIN)
      const latestThreads = database.prepare(`
        SELECT
          t.*,
          CASE WHEN u.showUsername = 1 THEN u.username ELSE NULL END as authorUsername,
          COALESCE(u.showUsername, 0) as authorShowUsername
        FROM threads t
        LEFT JOIN users u ON t.authorId = u.id
        WHERE t.hidden = 0
        ORDER BY t.createdAt DESC
        LIMIT 5
      `).all();

      // Payment/marketplace stats
      let paymentStats = {};
      try {
        const totalTips = database.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM tips').get();
        const totalPurchases = database.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM purchases').get();
        const totalEscrows = database.prepare('SELECT COUNT(*) as cnt FROM escrows').get();
        const activeEscrows = database.prepare('SELECT COUNT(*) as cnt FROM escrows WHERE status < 3').get();
        const totalSubscriptions = database.prepare('SELECT COUNT(*) as cnt FROM subscriptions WHERE expiresAt > ?').get(Date.now());
        const totalBadges = database.prepare('SELECT COUNT(*) as cnt FROM user_badges').get();

        paymentStats = {
          tips: { count: totalTips.cnt, totalAmount: totalTips.total },
          purchases: { count: totalPurchases.cnt, totalAmount: totalPurchases.total },
          escrows: { total: totalEscrows.cnt, active: activeEscrows.cnt },
          activeSubscriptions: totalSubscriptions.cnt,
          badgesIssued: totalBadges.cnt,
        };
      } catch (e) {
        sails.log.verbose('[api-dashboard] Payment stats not available:', e.message);
      }

      const result = {
        success: true,
        stats: {
          totalUsers,
          totalThreads,
          totalPosts,
          totalCategories,
          activeUsers24h: activeRow.cnt,
          latestThreads,
          ...paymentStats,
        },
      };

      // Cache for 10 seconds
      cache.set('dashboard:stats', result, 10000);

      return result;
    } catch (err) {
      sails.log.error('[api-dashboard]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
