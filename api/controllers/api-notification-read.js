/**
 * api-notification-read.js — PUT /api/v1/notifications/:id/read
 *
 * Mark a single notification as read.
 */

const db = require('../utility/db');
const { verifyUser } = require('../utility/authMiddleware');

module.exports = {
  friendlyName: 'API Mark Notification Read',
  description: 'Mark a single notification as read.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      const notifId = this.req.params.id;
      const database = db.getDb();

      // Auth: verify caller owns this notification
      const caller = await verifyUser(this.req);
      if (!caller) {
        this.res.status(403);
        return { success: false, error: 'Access denied. Authentication required.' };
      }

      // Verify the notification belongs to the caller
      const notif = database.prepare('SELECT userId FROM notifications WHERE id = ?').get(notifId);
      if (!notif || notif.userId !== caller) {
        this.res.status(403);
        return { success: false, error: 'Access denied. Notification does not belong to you.' };
      }

      database.prepare(
        'UPDATE notifications SET read = 1 WHERE id = ?'
      ).run(notifId);

      return { success: true };
    } catch (err) {
      sails.log.error('[api-notification-read]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
