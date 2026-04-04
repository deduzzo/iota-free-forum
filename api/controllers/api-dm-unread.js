/**
 * api-dm-unread.js — GET /api/v1/dm/:userId/unread-count
 *
 * Returns count of unread DMs for a user.
 */

const db = require('../utility/db');
const { verifyUser } = require('../utility/authMiddleware');

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

      // Auth: verify caller owns this userId
      const caller = await verifyUser(this.req);
      if (!caller || caller !== userId) {
        this.res.status(403);
        return { success: false, error: 'Access denied. Authentication required.' };
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
