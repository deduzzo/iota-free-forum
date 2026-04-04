/**
 * api-dm-unread.js — GET /api/v1/dm/:userId/unread-count
 *
 * Returns count of unread DMs for a user.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API DM Unread Count',
  description: 'Get unread DM count for a user.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      const userId = this.req.params.userId;
      if (!userId) {
        this.res.status(400);
        return { success: false, error: 'userId is required' };
      }

      const database = db.getDb();

      const row = database.prepare(
        'SELECT COUNT(*) as cnt FROM direct_messages WHERE toUserId = ? AND readAt IS NULL'
      ).get(userId);

      return {
        success: true,
        count: row.cnt,
      };
    } catch (err) {
      sails.log.error('[api-dm-unread]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
