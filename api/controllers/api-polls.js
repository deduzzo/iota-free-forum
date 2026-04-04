/**
 * api-polls.js — GET /api/v1/polls and GET /api/v1/polls/:id
 *
 * List active polls or get poll detail with votes grouped by option.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API Polls',
  description: 'List polls or get poll detail with vote breakdown.',

  inputs: {
    page: { type: 'number', defaultsTo: 1 },
    status: { type: 'string' }, // 'active', 'closed', or 'all'
  },

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function (inputs) {
    try {
      const database = db.getDb();
      const pollId = this.req.params.id;

      // Single poll detail
      if (pollId) {
        const poll = database.prepare(`
          SELECT p.*, u.username as creatorUsername, u.showUsername as creatorShowUsername
          FROM polls p
          LEFT JOIN users u ON p.creatorId = u.id
          WHERE p.id = ?
        `).get(pollId);

        if (!poll) {
          this.res.status(404);
          return { success: false, error: 'Poll not found' };
        }

        // Get votes grouped by option index
        const votesByOption = database.prepare(`
          SELECT optionIndex, COUNT(*) as voteCount
          FROM poll_votes
          WHERE pollId = ?
          GROUP BY optionIndex
          ORDER BY optionIndex ASC
        `).all(pollId);

        const totalVotes = votesByOption.reduce((sum, v) => sum + v.voteCount, 0);

        // Get individual votes with user info
        const votes = database.prepare(`
          SELECT pv.*, u.username as voterUsername, u.showUsername as voterShowUsername
          FROM poll_votes pv
          LEFT JOIN users u ON pv.voterId = u.id
          WHERE pv.pollId = ?
          ORDER BY pv.createdAt DESC
        `).all(pollId);

        // Parse poll data
        let pollData = null;
        try { pollData = poll.data ? JSON.parse(poll.data) : null; } catch (e) { /* */ }

        return {
          success: true,
          poll: { ...poll, parsedData: pollData },
          votesByOption,
          totalVotes,
          votes,
        };
      }

      // List polls
      const perPage = 20;
      const offset = (inputs.page - 1) * perPage;

      let whereClause = '1=1';
      if (inputs.status === 'active') whereClause = 'p.closed = 0';
      else if (inputs.status === 'closed') whereClause = 'p.closed = 1';

      const polls = database.prepare(`
        SELECT p.*, u.username as creatorUsername, u.showUsername as creatorShowUsername,
          (SELECT COUNT(*) FROM poll_votes WHERE pollId = p.id) as totalVotes
        FROM polls p
        LEFT JOIN users u ON p.creatorId = u.id
        WHERE ${whereClause}
        ORDER BY p.createdAt DESC
        LIMIT ? OFFSET ?
      `).all(perPage, offset);

      const total = database.prepare(
        `SELECT COUNT(*) as cnt FROM polls p WHERE ${whereClause}`
      ).get().cnt;

      // Parse data for each poll
      const pollsWithData = polls.map(p => {
        let parsedData = null;
        try { parsedData = p.data ? JSON.parse(p.data) : null; } catch (e) { /* */ }
        return { ...p, parsedData };
      });

      return {
        success: true,
        polls: pollsWithData,
        total,
        page: inputs.page,
        perPage,
      };
    } catch (err) {
      sails.log.error('[api-polls]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
