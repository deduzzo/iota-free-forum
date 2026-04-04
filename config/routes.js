module.exports.routes = {
  // =====================================================================
  // READ endpoints (unchanged — serve cached data from SQLite)
  // =====================================================================
  'GET /api/v1/members': { action: 'api-users' },
  'GET /api/v1/user/:id': { action: 'api-user' },
  'GET /api/v1/categories': { action: 'api-categories' },
  'GET /api/v1/threads': { action: 'api-threads' },
  'GET /api/v1/thread/:id': { action: 'api-thread-detail' },
  'GET /api/v1/posts': { action: 'api-posts' },
  'GET /api/v1/post/:id/history': { action: 'post-history' },
  'GET /api/v1/thread/:id/history': { action: 'thread-history' },
  'GET /api/v1/user/:id/history': { action: 'user-history' },
  'GET /api/v1/config/theme': { action: 'api-config-theme' },
  'GET /api/v1/config/theme/history': { action: 'config-theme-history' },
  'GET /api/v1/search': { action: 'api-search' },
  'GET /api/v1/dashboard': { action: 'api-dashboard' },
  'GET /api/v1/sync-status': { action: 'api-sync-status' },
  'GET /api/v1/export-data': { action: 'export-data' },
  'GET /api/v1/forum-info': { action: 'api-forum-info' },
  'GET /api/v1/integrity-check': { action: 'api-integrity-check' },

  // =====================================================================
  // NEW endpoints — payments, marketplace, reputation
  // =====================================================================
  'POST /api/v1/faucet-request': { action: 'faucet-request' },
  'POST /api/v1/deploy-contract': { action: 'deploy-contract' },
  'GET /api/v1/user/:id/reputation': { action: 'api-reputation' },
  'GET /api/v1/user/:id/subscription': { action: 'api-subscription' },
  'GET /api/v1/escrows': { action: 'api-escrows' },
  'GET /api/v1/escrow/:id': { action: 'api-escrow' },
  'GET /api/v1/marketplace': { action: 'api-marketplace' },
  'GET /api/v1/tips/:postId': { action: 'api-tips' },

  // ── Notifications ──────────────────────────────────────────────
  'GET /api/v1/notifications/:userId': { action: 'api-notifications' },
  'GET /api/v1/notifications/:userId/unread-count': { action: 'api-notifications-unread' },
  'PUT /api/v1/notifications/:id/read': { action: 'api-notification-read' },
  'PUT /api/v1/notifications/:userId/read-all': { action: 'api-notifications-read-all' },

  // ── Reactions ──────────────────────────────────────────────────
  'GET /api/v1/reactions/:postId': { action: 'api-reactions' },

  // ── Direct Messages (E2E encrypted) ───────────────────────────
  'GET /api/v1/dm/conversations/:userId': { action: 'api-dm-conversations' },
  'GET /api/v1/dm/:userId/unread-count': { action: 'api-dm-unread' },
  'GET /api/v1/dm/:userId/:otherUserId': { action: 'api-dm-messages' },

  // ── Social Graph (follows) ──────────────────────────────────
  'GET /api/v1/followers/:userId': { action: 'api-follows' },
  'GET /api/v1/following/:userId': { action: 'api-follows' },
  'GET /api/v1/followers/:userId/count': { action: 'api-follows' },

  // ── Governance ────────────────────────────────────────────────
  'GET /api/v1/polls': { action: 'api-polls' },
  'GET /api/v1/polls/:id': { action: 'api-polls' },
  'GET /api/v1/proposals': { action: 'api-proposals' },
  'GET /api/v1/proposals/:id': { action: 'api-proposals' },

  // ── RSS Feeds ─────────────────────────────────────────────────
  'GET /api/v1/rss/latest': { action: 'api-rss' },
  'GET /api/v1/rss/category/:categoryId': { action: 'api-rss' },

  // =====================================================================
  // ADMIN endpoints (require admin authentication)
  // =====================================================================
  'GET /api/v1/admin/audit/stats': { action: 'api-audit' },
  'GET /api/v1/admin/audit/export': { action: 'api-audit' },
  'GET /api/v1/admin/audit/transactions/:id': { action: 'api-audit' },
  'GET /api/v1/admin/audit/transactions': { action: 'api-audit' },
  'POST /api/v1/sync-reset': { action: 'api-sync-reset' },
  'POST /api/v1/sync-connect': { action: 'sync-connect' },
  'POST /api/v1/full-reset': { action: 'full-reset' },

  // ── Agent Beta Testers ─────────────────────────────────────────
  'POST /api/v1/admin/agents/start': { action: 'api-agents' },
  'POST /api/v1/admin/agents/stop': { action: 'api-agents' },
  'POST /api/v1/admin/agents/pause': { action: 'api-agents' },
  'GET /api/v1/admin/agents/status': { action: 'api-agents' },
  'GET /api/v1/admin/agents/feedback': { action: 'api-agents' },

  // =====================================================================
  // DEPRECATED write endpoints — now return 410 Gone
  // All write operations happen directly on-chain via IOTA smart contract.
  // These are kept for backward compatibility; they return deprecation notices.
  // =====================================================================
  'POST /api/v1/register': { action: 'register' },
  'PUT /api/v1/user/:id': { action: 'edit-user' },
  'POST /api/v1/categories': { action: 'create-category' },
  'PUT /api/v1/categories/:id': { action: 'edit-category' },
  'POST /api/v1/threads': { action: 'create-thread' },
  'PUT /api/v1/thread/:id': { action: 'edit-thread' },
  'POST /api/v1/posts': { action: 'create-post' },
  'PUT /api/v1/post/:id': { action: 'edit-post' },
  'POST /api/v1/vote': { action: 'vote' },
  'POST /api/v1/moderate': { action: 'moderate' },
  'POST /api/v1/moderate/thread': { action: 'moderate-thread' },
  'POST /api/v1/role': { action: 'assign-role' },
  'PUT /api/v1/config/theme': { action: 'update-config-theme' },

  // SPA catch-all: serve index.html for all non-API routes (React Router)
  'GET /*': {
    skipAssets: true,
    fn: function (req, res) {
      const path = require('path');
      const fs = require('fs');
      const indexPath = path.resolve(sails.config.appPath, '.tmp', 'public', 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      return res.notFound();
    },
  },
};
