/**
 * api-follows.js — Follow endpoints
 *
 * GET /api/v1/followers/:userId — list followers of a user
 * GET /api/v1/following/:userId — list users a user follows
 * GET /api/v1/followers/:userId/count — follower/following counts
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API Follows',
  description: 'Get followers, following, or counts for a user.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      const userId = this.req.params.userId;
      const database = db.getDb();
      const pathParts = this.req.path.split('/');

      // Determine which endpoint was hit
      const isCount = pathParts[pathParts.length - 1] === 'count';
      const isFollowing = pathParts.includes('following');

      if (isCount) {
        const followerCount = database.prepare(
          'SELECT COUNT(*) as cnt FROM follows WHERE followingId = ?'
        ).get(userId).cnt;

        const followingCount = database.prepare(
          'SELECT COUNT(*) as cnt FROM follows WHERE followerId = ?'
        ).get(userId).cnt;

        return {
          success: true,
          followerCount,
          followingCount,
        };
      }

      if (isFollowing) {
        // Users that this user follows
        const following = database.prepare(`
          SELECT f.followingId as userId, f.createdAt,
            u.username, u.avatar, u.showUsername
          FROM follows f
          LEFT JOIN users u ON f.followingId = u.id
          WHERE f.followerId = ?
          ORDER BY f.createdAt DESC
        `).all(userId);

        return {
          success: true,
          users: following,
          total: following.length,
        };
      }

      // Default: followers of this user
      const followers = database.prepare(`
        SELECT f.followerId as userId, f.createdAt,
          u.username, u.avatar, u.showUsername
        FROM follows f
        LEFT JOIN users u ON f.followerId = u.id
        WHERE f.followingId = ?
        ORDER BY f.createdAt DESC
      `).all(userId);

      return {
        success: true,
        users: followers,
        total: followers.length,
      };
    } catch (err) {
      sails.log.error('[api-follows]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
