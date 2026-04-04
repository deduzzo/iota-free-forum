/**
 * api-notifications-unread.js — GET /api/v1/notifications/:userId/unread-count
 *
 * Returns the count of unread notifications for a user.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API Notifications Unread Count',
  description: 'Get unread notification count for a user.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      const userId = this.req.params.userId;
      const database = db.getDb();

      const row = database.prepare(
        'SELECT COUNT(*) as cnt FROM notifications WHERE userId = ? AND read = 0'
      ).get(userId);

      return {
        success: true,
        unreadCount: row.cnt,
      };
    } catch (err) {
      sails.log.error('[api-notifications-unread]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
