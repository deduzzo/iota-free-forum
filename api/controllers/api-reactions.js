/**
 * api-reactions.js — GET /api/v1/reactions/:postId
 *
 * Returns reactions for a post, grouped by emoji with count and user list.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API Reactions',
  description: 'Get reactions for a specific post, grouped by emoji.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      const postId = this.req.params.postId;
      const database = db.getDb();

      // Get all reactions for this post with user info
      const reactions = database.prepare(`
        SELECT
          r.emoji,
          r.userId,
          u.username,
          u.showUsername
        FROM reactions r
        LEFT JOIN users u ON r.userId = u.id
        WHERE r.postId = ?
        ORDER BY r.createdAt ASC
      `).all(postId);

      // Group by emoji
      const grouped = {};
      for (const r of reactions) {
        if (!grouped[r.emoji]) {
          grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        }
        grouped[r.emoji].count++;
        grouped[r.emoji].users.push({
          userId: r.userId,
          username: r.username,
          showUsername: r.showUsername,
        });
      }

      return {
        success: true,
        reactions: Object.values(grouped),
        totalReactions: reactions.length,
      };
    } catch (err) {
      sails.log.error('[api-reactions]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
