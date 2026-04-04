/**
 * api-proposals.js — GET /api/v1/proposals and GET /api/v1/proposals/:id
 *
 * List proposals or get proposal detail with votes.
 */

const db = require('../utility/db');

module.exports = {
  friendlyName: 'API Proposals',
  description: 'List proposals or get proposal detail with votes.',

  inputs: {
    page: { type: 'number', defaultsTo: 1 },
    status: { type: 'string' }, // 'active', 'passed', 'rejected', or 'all'
  },

  exits: {
    success: { statusCode: 200 },
  },

  fn: async function (inputs) {
    try {
      const database = db.getDb();
      const proposalId = this.req.params.id;

      // Single proposal detail
      if (proposalId) {
        const proposal = database.prepare(`
          SELECT p.*, u.username as creatorUsername, u.showUsername as creatorShowUsername
          FROM proposals p
          LEFT JOIN users u ON p.creatorId = u.id
          WHERE p.id = ?
        `).get(proposalId);

        if (!proposal) {
          this.res.status(404);
          return { success: false, error: 'Proposal not found' };
        }

        // Get vote counts
        const yesVotes = database.prepare(
          'SELECT COUNT(*) as cnt FROM proposal_votes WHERE proposalId = ? AND voteYes = 1'
        ).get(proposalId).cnt;

        const noVotes = database.prepare(
          'SELECT COUNT(*) as cnt FROM proposal_votes WHERE proposalId = ? AND voteYes = 0'
        ).get(proposalId).cnt;

        const totalVotes = yesVotes + noVotes;

        // Get individual votes with user info
        const votes = database.prepare(`
          SELECT pv.*, u.username as voterUsername, u.showUsername as voterShowUsername
          FROM proposal_votes pv
          LEFT JOIN users u ON pv.voterId = u.id
          WHERE pv.proposalId = ?
          ORDER BY pv.createdAt DESC
        `).all(proposalId);

        // Parse proposal data
        let proposalData = null;
        try { proposalData = proposal.data ? JSON.parse(proposal.data) : null; } catch (e) { /* */ }

        return {
          success: true,
          proposal: { ...proposal, parsedData: proposalData },
          yesVotes,
          noVotes,
          totalVotes,
          votes,
        };
      }

      // List proposals
      const perPage = 20;
      const offset = (inputs.page - 1) * perPage;

      let whereClause = '1=1';
      // status: 0=active, 1=passed, 2=rejected, 3=expired
      if (inputs.status === 'active') whereClause = 'p.status = 0';
      else if (inputs.status === 'passed') whereClause = 'p.status = 1';
      else if (inputs.status === 'rejected') whereClause = 'p.status = 2';

      const proposals = database.prepare(`
        SELECT p.*, u.username as creatorUsername, u.showUsername as creatorShowUsername,
          (SELECT COUNT(*) FROM proposal_votes WHERE proposalId = p.id AND voteYes = 1) as yesVotes,
          (SELECT COUNT(*) FROM proposal_votes WHERE proposalId = p.id AND voteYes = 0) as noVotes,
          (SELECT COUNT(*) FROM proposal_votes WHERE proposalId = p.id) as totalVotes
        FROM proposals p
        LEFT JOIN users u ON p.creatorId = u.id
        WHERE ${whereClause}
        ORDER BY p.createdAt DESC
        LIMIT ? OFFSET ?
      `).all(perPage, offset);

      const total = database.prepare(
        `SELECT COUNT(*) as cnt FROM proposals p WHERE ${whereClause}`
      ).get().cnt;

      // Parse data for each proposal
      const proposalsWithData = proposals.map(p => {
        let parsedData = null;
        try { parsedData = p.data ? JSON.parse(p.data) : null; } catch (e) { /* */ }
        return { ...p, parsedData };
      });

      return {
        success: true,
        proposals: proposalsWithData,
        total,
        page: inputs.page,
        perPage,
      };
    } catch (err) {
      sails.log.error('[api-proposals]', err.message || err);
      this.res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
