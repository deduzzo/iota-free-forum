/**
 * api-agents.js — Agent Beta Testers admin endpoints.
 *
 * All endpoints require admin role verified from the SQLite cache.
 * The adminAddress query/body param identifies the caller.
 */

const db = require('../utility/db');
const { getOrchestrator } = require('../utility/AgentOrchestrator');

// ── Admin verification helper ───────────────────────────────────────────────

function verifyAdmin(adminAddress, res) {
  if (!adminAddress) {
    res.status(400);
    return { success: false, error: 'adminAddress is required' };
  }
  const Users = db.getModel('users');
  const admin = Users.findOne({ id: adminAddress });
  if (!admin || admin.role !== 'admin') {
    res.status(403);
    return { success: false, error: 'Access denied. Admin role required.' };
  }
  return null; // OK
}

module.exports = {
  friendlyName: 'Agent Testers API',
  description: 'Start, stop, pause, and monitor AI beta tester agents. Admin only.',

  inputs: {
    // Used by all endpoints
    adminAddress: { type: 'string' },
    // Used by start
    count: { type: 'number' },
    duration: { type: 'number' },
    frequency: { type: 'number' },
    personality: { type: 'string' },
    modules: { type: 'json' },
    // limit for activity log
    limit: { type: 'number' },
  },

  exits: {
    success: { statusCode: 200 },
    forbidden: { statusCode: 403 },
    badRequest: { statusCode: 400 },
    serverError: { statusCode: 500 },
  },

  fn: async function (inputs) {
    const req = this.req;
    const res = this.res;

    // Route based on method + path
    const method = req.method;
    const url = req.url;

    try {
      // POST /api/v1/admin/agents/start
      if (method === 'POST' && url.includes('/start')) {
        const err = verifyAdmin(inputs.adminAddress, res);
        if (err) return err;

        const orchestrator = getOrchestrator();

        if (orchestrator.running) {
          res.status(400);
          return { success: false, error: 'Agents already running. Stop first.' };
        }

        const config = {
          count: inputs.count || 5,
          duration: inputs.duration || 300,
          frequency: inputs.frequency || 10,
          personality: inputs.personality || 'random',
          modules: inputs.modules || ['forum', 'payments', 'escrow', 'social', 'edgecases'],
        };

        sails.log.info(`[api-agents] Starting ${config.count} agents (admin: ${inputs.adminAddress})`);

        const initResult = await orchestrator.initialize(config);
        const startResult = await orchestrator.start();

        return {
          success: true,
          initialized: initResult,
          started: startResult,
          status: orchestrator.getStatus(),
        };
      }

      // POST /api/v1/admin/agents/stop
      if (method === 'POST' && url.includes('/stop')) {
        const err = verifyAdmin(inputs.adminAddress, res);
        if (err) return err;

        const orchestrator = getOrchestrator();
        const status = orchestrator.stop();

        sails.log.info(`[api-agents] Agents stopped (admin: ${inputs.adminAddress})`);
        return { success: true, status };
      }

      // POST /api/v1/admin/agents/pause
      if (method === 'POST' && url.includes('/pause')) {
        const err = verifyAdmin(inputs.adminAddress, res);
        if (err) return err;

        const orchestrator = getOrchestrator();

        if (orchestrator.paused) {
          orchestrator.resume();
          sails.log.info(`[api-agents] Agents resumed (admin: ${inputs.adminAddress})`);
          return { success: true, action: 'resumed', status: orchestrator.getStatus() };
        } else {
          orchestrator.pause();
          sails.log.info(`[api-agents] Agents paused (admin: ${inputs.adminAddress})`);
          return { success: true, action: 'paused', status: orchestrator.getStatus() };
        }
      }

      // GET /api/v1/admin/agents/status
      if (method === 'GET' && url.includes('/status')) {
        const adminAddr = inputs.adminAddress || req.query?.adminAddress;
        const err = verifyAdmin(adminAddr, res);
        if (err) return err;

        const orchestrator = getOrchestrator();
        return {
          success: true,
          ...orchestrator.getStatus(),
          activityLog: orchestrator.getActivityLog(inputs.limit || 50),
        };
      }

      // GET /api/v1/admin/agents/feedback
      if (method === 'GET' && url.includes('/feedback')) {
        const adminAddr = inputs.adminAddress || req.query?.adminAddress;
        const err = verifyAdmin(adminAddr, res);
        if (err) return err;

        const orchestrator = getOrchestrator();
        return {
          success: true,
          feedback: orchestrator.getFeedback(),
          stats: {
            actions: orchestrator.stats.actions,
            errors: orchestrator.stats.errors,
          },
        };
      }

      res.status(404);
      return { success: false, error: 'Unknown agent endpoint' };

    } catch (error) {
      sails.log.error(`[api-agents] Error: ${error.message}`);
      res.status(500);
      return { success: false, error: error.message };
    }
  },
};
