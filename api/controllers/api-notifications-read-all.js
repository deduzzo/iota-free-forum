/**
 * api-notifications-read-all.js — PUT /api/v1/notifications/:userId/read-all
 *
 * Mark all notifications as read for a user.
 */

const db = require('../utility/db');
const { verifyUser } = require('../utility/authMiddleware');

module.exports = {
  friendlyName: 'API Mark All Notifications Read',
  description: 'Mark all notifications as read for a user.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      const userId = this.req.params.userId;

      // Auth: verify caller owns this userId
      const caller = await verifyUser(this.req);
      if (!caller || caller !== userId) {
        this.res.status(403);
        return { success: false, error: 'Access denied. Authentication required.' };
      }
      const database = db.getDb();

      const result = database.prepare(
        'UPDATE notifications SET read = 1 WHERE userId = ? AND read = 0'
      ).run(userId);

      return {
        success: true,
        updated: result.changes,
      };
    } catch (err) {
      sails.log.error('[api-notifications-read-all]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
