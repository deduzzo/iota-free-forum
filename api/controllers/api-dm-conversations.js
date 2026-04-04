/**
 * api-dm-conversations.js — GET /api/v1/dm/conversations/:userId
 *
 * Returns list of conversations (distinct users) for the given user,
 * with the latest message info for each conversation.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API DM Conversations',
  description: 'Get list of DM conversations for a user.',

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

      // Get distinct conversation partners with latest message
      const conversations = database.prepare(`
        SELECT
          partner,
          MAX(createdAt) as lastMessageAt,
          COUNT(*) as messageCount,
          SUM(CASE WHEN toUserId = ? AND readAt IS NULL THEN 1 ELSE 0 END) as unreadCount
        FROM (
          SELECT
            CASE WHEN fromUserId = ? THEN toUserId ELSE fromUserId END as partner,
            createdAt,
            toUserId,
            readAt
          FROM direct_messages
          WHERE fromUserId = ? OR toUserId = ?
        )
        GROUP BY partner
        ORDER BY lastMessageAt DESC
      `).all(userId, userId, userId, userId);

      // Enrich with user info
      const enriched = conversations.map((conv) => {
        const user = database.prepare(
          'SELECT id, username, avatar, showUsername FROM users WHERE id = ?'
        ).get(conv.partner);
        return {
          ...conv,
          partnerUsername: user?.username || null,
          partnerAvatar: user?.avatar || null,
          partnerShowUsername: user?.showUsername || 0,
        };
      });

      return {
        success: true,
        conversations: enriched,
      };
    } catch (err) {
      sails.log.error('[api-dm-conversations]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
