/**
 * api-notifications.js — GET /api/v1/notifications/:userId
 *
 * Returns paginated notifications for a user.
 */

const db = require('../utility/db');
const { verifyUser } = require('../utility/authMiddleware');

module.exports = {
  friendlyName: 'API Notifications',
  description: 'Get paginated notifications for a user.',

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
      const page = parseInt(this.req.query.page) || 1;
      const perPage = parseInt(this.req.query.perPage) || 20;
      const type = this.req.query.type || null;
      const offset = (page - 1) * perPage;

      const database = db.getDb();

      let whereSql = 'WHERE n.userId = ?';
      const params = [userId];

      if (type) {
        whereSql += ' AND n.type = ?';
        params.push(type);
      }

      const notifications = database.prepare(`
        SELECT
          n.*,
          u.username as fromUsername,
          u.showUsername as fromShowUsername,
          u.avatar as fromAvatar
        FROM notifications n
        LEFT JOIN users u ON n.fromUserId = u.id
        ${whereSql}
        ORDER BY n.createdAt DESC
        LIMIT ? OFFSET ?
      `).all(...params, perPage, offset);

      const totalRow = database.prepare(
        `SELECT COUNT(*) as cnt FROM notifications n ${whereSql}`
      ).get(...params);

      return {
        success: true,
        notifications,
        total: totalRow.cnt,
        page,
        perPage,
      };
    } catch (err) {
      sails.log.error('[api-notifications]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
