/**
 * api-dm-messages.js — GET /api/v1/dm/:userId/:otherUserId
 *
 * Returns paginated encrypted messages between two users.
 * Messages are E2E encrypted — server returns ciphertext as-is.
 */

const db = require('../utility/db');
const { verifyUser } = require('../utility/authMiddleware');

module.exports = {
  friendlyName: 'API DM Messages',
  description: 'Get encrypted messages between two users.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function () {
    try {
      const { userId, otherUserId } = this.req.params;
      if (!userId || !otherUserId) {
        this.res.status(400);
        return { success: false, error: 'Both userId and otherUserId are required' };
      }

      // Auth: verify caller owns this userId (only the owner can read their DMs)
      const caller = await verifyUser(this.req);
      if (!caller || caller !== userId) {
        this.res.status(403);
        return { success: false, error: 'Access denied. Authentication required.' };
      }

      const page = parseInt(this.req.query.page) || 1;
      const perPage = parseInt(this.req.query.perPage) || 50;
      const offset = (page - 1) * perPage;

      const database = db.getDb();

      const messages = database.prepare(`
        SELECT dm.*, u.username as fromUsername, u.avatar as fromAvatar, u.showUsername as fromShowUsername
        FROM direct_messages dm
        LEFT JOIN users u ON dm.fromUserId = u.id
        WHERE (dm.fromUserId = ? AND dm.toUserId = ?)
           OR (dm.fromUserId = ? AND dm.toUserId = ?)
        ORDER BY dm.createdAt ASC
        LIMIT ? OFFSET ?
      `).all(userId, otherUserId, otherUserId, userId, perPage, offset);

      const totalRow = database.prepare(`
        SELECT COUNT(*) as cnt FROM direct_messages
        WHERE (fromUserId = ? AND toUserId = ?)
           OR (fromUserId = ? AND toUserId = ?)
      `).get(userId, otherUserId, otherUserId, userId);

      // Mark messages as read (ones sent TO this user)
      database.prepare(`
        UPDATE direct_messages SET readAt = datetime('now')
        WHERE toUserId = ? AND fromUserId = ? AND readAt IS NULL
      `).run(userId, otherUserId);

      return {
        success: true,
        messages,
        total: totalRow.cnt,
        page,
        perPage,
      };
    } catch (err) {
      sails.log.error('[api-dm-messages]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
