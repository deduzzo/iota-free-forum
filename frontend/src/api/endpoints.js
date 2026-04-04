const API_BASE = '/api/v1';

/**
 * Read-only API endpoints (no signature required).
 * Write operations now go directly to the blockchain via useIdentity().signAndSend().
 */
export const api = {
  // Categories
  getCategories: () =>
    fetch(`${API_BASE}/categories`).then((r) => r.json()),

  // Threads
  getThreads: (categoryId, page = 1) =>
    fetch(`${API_BASE}/threads?category=${categoryId}&page=${page}`).then((r) => r.json()),

  getThread: (id) =>
    fetch(`${API_BASE}/thread/${id}`).then((r) => r.json()),

  // Posts
  getPosts: (threadId) =>
    fetch(`${API_BASE}/posts?thread=${threadId}`).then((r) => r.json()),

  // Users
  getUsers: (params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
    const q = new URLSearchParams(clean).toString();
    return fetch(`${API_BASE}/members${q ? '?' + q : ''}`).then((r) => r.json());
  },
  getUser: (id) =>
    fetch(`${API_BASE}/user/${id}`).then((r) => r.json()),

  // Config & Status
  getTheme: () =>
    fetch(`${API_BASE}/config/theme`).then((r) => r.json()),

  getDashboard: () =>
    fetch(`${API_BASE}/dashboard`).then((r) => r.json()),

  getSyncStatus: () =>
    fetch(`${API_BASE}/sync-status`).then((r) => r.json()),

  // History (edit versions)
  getPostHistory: (id) =>
    fetch(`${API_BASE}/post/${id}/history`).then((r) => r.json()),

  getThreadHistory: (id) =>
    fetch(`${API_BASE}/thread/${id}/history`).then((r) => r.json()),

  // Search
  search: (q) =>
    fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`).then((r) => r.json()),

  // Forum info
  getForumInfo: () =>
    fetch(`${API_BASE}/forum-info`).then((r) => r.json()),

  // ── New endpoints (payments / reputation) ─────────────────────────────────

  // Deploy contract — first-time setup
  deployContract: () =>
    fetch(`${API_BASE}/deploy-contract`, { method: 'POST' }).then((r) => r.json()),

  // Faucet — request gas tokens for a new address
  requestFaucet: (address) =>
    fetch(`${API_BASE}/faucet-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    }).then((r) => r.json()),

  // User reputation
  getUserReputation: (id) =>
    fetch(`${API_BASE}/user/${id}/reputation`).then((r) => r.json()),

  // Subscription status
  getSubscriptionStatus: (id) =>
    fetch(`${API_BASE}/user/${id}/subscriptions`).then((r) => r.json()),

  // Escrows
  getEscrows: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.buyer) params.set('buyer', filters.buyer);
    if (filters.seller) params.set('seller', filters.seller);
    if (filters.status) params.set('status', filters.status);
    const qs = params.toString();
    return fetch(`${API_BASE}/escrows${qs ? `?${qs}` : ''}`).then((r) => r.json());
  },

  getEscrow: (id) =>
    fetch(`${API_BASE}/escrow/${id}`).then((r) => r.json()),

  // Marketplace
  getMarketplace: () =>
    fetch(`${API_BASE}/marketplace`).then((r) => r.json()),

  // Tips on a specific post
  getPostTips: (postId) =>
    fetch(`${API_BASE}/tips/${postId}`).then((r) => r.json()),

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications: (userId, page = 1, type = null) => {
    const params = new URLSearchParams({ page });
    if (type) params.set('type', type);
    return fetch(`${API_BASE}/notifications/${userId}?${params}`).then((r) => r.json());
  },

  getUnreadCount: (userId) =>
    fetch(`${API_BASE}/notifications/${userId}/unread-count`).then((r) => r.json()),

  markNotificationRead: (id) =>
    fetch(`${API_BASE}/notifications/${id}/read`, { method: 'PUT' }).then((r) => r.json()),

  markAllNotificationsRead: (userId) =>
    fetch(`${API_BASE}/notifications/${userId}/read-all`, { method: 'PUT' }).then((r) => r.json()),

  // ── Reactions ─────────────────────────────────────────────────────────
  getReactions: (postId) =>
    fetch(`${API_BASE}/reactions/${postId}`).then((r) => r.json()),

  // ── Direct Messages (E2E encrypted) ─────────────────────────────────
  getDMConversations: (userId) =>
    fetch(`${API_BASE}/dm/conversations/${userId}`).then((r) => r.json()),

  getDMMessages: (userId, otherUserId, page = 1) =>
    fetch(`${API_BASE}/dm/${userId}/${otherUserId}?page=${page}`).then((r) => r.json()),

  getDMUnreadCount: (userId) =>
    fetch(`${API_BASE}/dm/${userId}/unread-count`).then((r) => r.json()),

  // ── Audit Dashboard (admin) ─────────────────────────────────────────
  getAuditStats: (adminAddress) =>
    fetch(`${API_BASE}/admin/audit/stats?adminAddress=${encodeURIComponent(adminAddress)}`).then((r) => r.json()),

  getAuditTransactions: (adminAddress, filters = {}) => {
    const params = new URLSearchParams({ adminAddress });
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.authorId) params.set('authorId', filters.authorId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.page) params.set('page', filters.page);
    if (filters.limit) params.set('limit', filters.limit);
    return fetch(`${API_BASE}/admin/audit/transactions?${params}`).then((r) => r.json());
  },

  getAuditTransaction: (adminAddress, id) =>
    fetch(`${API_BASE}/admin/audit/transactions/${id}?adminAddress=${encodeURIComponent(adminAddress)}`).then((r) => r.json()),

  getAuditExportUrl: (adminAddress, filters = {}) => {
    const params = new URLSearchParams({ adminAddress });
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.authorId) params.set('authorId', filters.authorId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    return `${API_BASE}/admin/audit/export?${params}`;
  },

  // ── Social Graph (follows) ──���────────────────────────��─────────────
  getFollowers: (userId) =>
    fetch(`${API_BASE}/followers/${userId}`).then((r) => r.json()),

  getFollowing: (userId) =>
    fetch(`${API_BASE}/following/${userId}`).then((r) => r.json()),

  getFollowCounts: (userId) =>
    fetch(`${API_BASE}/followers/${userId}/count`).then((r) => r.json()),

  // ── Governance ─────────────────��───────────────────────────────────
  getPolls: (page = 1, status = 'all') => {
    const params = new URLSearchParams({ page, status });
    return fetch(`${API_BASE}/polls?${params}`).then((r) => r.json());
  },

  getPoll: (id) =>
    fetch(`${API_BASE}/polls/${id}`).then((r) => r.json()),

  getProposals: (page = 1, status = 'all') => {
    const params = new URLSearchParams({ page, status });
    return fetch(`${API_BASE}/proposals?${params}`).then((r) => r.json());
  },

  getProposal: (id) =>
    fetch(`${API_BASE}/proposals/${id}`).then((r) => r.json()),

  // ── Agent Beta Testers (admin) ───────────────────────────────────────
  startAgents: (adminAddress, config) =>
    fetch(`${API_BASE}/admin/agents/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminAddress, ...config }),
    }).then((r) => r.json()),

  stopAgents: (adminAddress) =>
    fetch(`${API_BASE}/admin/agents/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminAddress }),
    }).then((r) => r.json()),

  pauseAgents: (adminAddress) =>
    fetch(`${API_BASE}/admin/agents/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminAddress }),
    }).then((r) => r.json()),

  getAgentsStatus: (adminAddress) =>
    fetch(`${API_BASE}/admin/agents/status?adminAddress=${encodeURIComponent(adminAddress)}`).then((r) => r.json()),

  getAgentsFeedback: (adminAddress) =>
    fetch(`${API_BASE}/admin/agents/feedback?adminAddress=${encodeURIComponent(adminAddress)}`).then((r) => r.json()),
};
