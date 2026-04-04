/**
 * api-notification-read.js — PUT /api/v1/notifications/:id/read
 *
 * Mark a single notification as read.
 */

const db = require('../utility/db');

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
