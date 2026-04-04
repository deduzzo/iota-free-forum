/**
 * api-audit.js — Admin Audit Dashboard API.
 *
 * Provides transaction log queries, statistics, and CSV export.
 * All endpoints require admin authentication via adminAddress query param.
 */

const db = require('../utility/db');
const cache = require('../utility/cache');
const { verifyAdmin } = require('../utility/authMiddleware');

module.exports = {
  friendlyName: 'API Audit',
  description: 'Admin audit dashboard: transaction log, stats, export.',

  inputs: {},

  exits: {
    success: { statusCode: 200 },
    forbidden: { statusCode: 403 },
  },

  fn: async function () {
    const req = this.req;
    const res = this.res;
    const url = req.url;

    // Verify admin via Ed25519 signature headers
    const admin = await verifyAdmin(req);
    if (!admin) {
      res.status(403);
      return { success: false, error: 'Access denied. Admin Ed25519 authentication required.' };
    }

    try {
      const database = db.getDb();

      // ── Route: GET /api/v1/admin/audit/stats ─────────────────────────
      if (url.includes('/audit/stats')) {
        const cached = cache.get('audit:stats');
        if (cached) return cached;

        const totalTx = database.prepare('SELECT COUNT(*) as cnt FROM transaction_log').get().cnt;

        const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
        const tx24h = database.prepare('SELECT COUNT(*) as cnt FROM transaction_log WHERE timestamp >= ?').get(oneDayAgo).cnt;

        // TX per type
        const byType = database.prepare(
          'SELECT tag, COUNT(*) as count FROM transaction_log GROUP BY tag ORDER BY count DESC'
        ).all();

        // TX per hour (last 24h)
        const txPerHour = database.prepare(`
          SELECT
            strftime('%Y-%m-%dT%H:00:00', timestamp) as hour,
            tag,
            COUNT(*) as count
          FROM transaction_log
          WHERE timestamp >= ?
          GROUP BY hour, tag
          ORDER BY hour ASC
        `).all(oneDayAgo);

        // Active users today
        const activeUsers = database.prepare(
          'SELECT COUNT(DISTINCT authorId) as cnt FROM transaction_log WHERE timestamp >= ?'
        ).get(oneDayAgo).cnt;

        // Payment volume
        let paymentVolume = { tips: 0, escrows: 0, purchases: 0 };
        try {
          const tipTotal = database.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM tips').get();
          const escrowTotal = database.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM escrows').get();
          const purchaseTotal = database.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM purchases').get();
          paymentVolume = {
            tips: tipTotal.total,
            escrows: escrowTotal.total,
            purchases: purchaseTotal.total,
          };
        } catch (e) { /* tables may not exist */ }

        // Top 10 users by TX count
        const topUsers = database.prepare(`
          SELECT authorId, COUNT(*) as txCount
          FROM transaction_log
          WHERE authorId IS NOT NULL
          GROUP BY authorId
          ORDER BY txCount DESC
          LIMIT 10
        `).all();

        // Enrich top users with usernames
        const Users = db.getModel('users');
        for (const u of topUsers) {
          const user = Users.findOne({ id: u.authorId });
          u.username = user?.username || null;
        }

        // Average TX per hour
        const avgTxPerHour = totalTx > 0
          ? Math.round(tx24h / 24 * 10) / 10
          : 0;

        const result = {
          success: true,
          stats: {
            totalTx,
            tx24h,
            activeUsers,
            avgTxPerHour,
            paymentVolume,
            byType,
            txPerHour,
            topUsers,
          },
        };

        cache.set('audit:stats', result, 15000);
        return result;
      }

      // ── Route: GET /api/v1/admin/audit/export ────────────────────────
      if (url.includes('/audit/export')) {
        const { tag, authorId, dateFrom, dateTo } = req.query;

        let where = '1=1';
        const params = [];

        if (tag) { where += ' AND tag = ?'; params.push(tag); }
        if (authorId) { where += ' AND authorId = ?'; params.push(authorId); }
        if (dateFrom) { where += ' AND timestamp >= ?'; params.push(dateFrom); }
        if (dateTo) { where += ' AND timestamp <= ?'; params.push(dateTo); }

        const rows = database.prepare(
          `SELECT id, txDigest, tag, entityId, authorId, action, isEncrypted, dataPreview, gasUsed, timestamp, createdAt
           FROM transaction_log WHERE ${where} ORDER BY timestamp DESC LIMIT 10000`
        ).all(...params);

        // Build CSV
        const headers = ['id', 'txDigest', 'tag', 'entityId', 'authorId', 'action', 'isEncrypted', 'dataPreview', 'gasUsed', 'timestamp', 'createdAt'];
        const csvLines = [headers.join(',')];
        for (const row of rows) {
          const line = headers.map(h => {
            const val = row[h];
            if (val == null) return '';
            const str = String(val).replace(/"/g, '""');
            return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
          }).join(',');
          csvLines.push(line);
        }

        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', 'attachment; filename="audit-transactions.csv"');
        return res.send(csvLines.join('\n'));
      }

      // ── Route: GET /api/v1/admin/audit/transactions/:id ──────────────
      const idMatch = url.match(/\/audit\/transactions\/(\d+)/);
      if (idMatch) {
        const txId = parseInt(idMatch[1]);
        const tx = database.prepare('SELECT * FROM transaction_log WHERE id = ?').get(txId);
        if (!tx) {
          res.status(404);
          return { success: false, error: 'Transaction not found' };
        }
        return { success: true, transaction: tx };
      }

      // ── Route: GET /api/v1/admin/audit/transactions ──────────────────
      if (url.includes('/audit/transactions')) {
        const { tag, authorId, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
        const offset = (pageNum - 1) * limitNum;

        let where = '1=1';
        const params = [];

        if (tag) { where += ' AND tag = ?'; params.push(tag); }
        if (authorId) { where += ' AND authorId LIKE ?'; params.push(`%${authorId}%`); }
        if (dateFrom) { where += ' AND timestamp >= ?'; params.push(dateFrom); }
        if (dateTo) { where += ' AND timestamp <= ?'; params.push(dateTo); }

        const total = database.prepare(
          `SELECT COUNT(*) as cnt FROM transaction_log WHERE ${where}`
        ).get(...params).cnt;

        const transactions = database.prepare(
          `SELECT * FROM transaction_log WHERE ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        ).all(...params, limitNum, offset);

        return {
          success: true,
          transactions,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        };
      }

      return { success: false, error: 'Unknown audit endpoint' };
    } catch (err) {
      sails.log.error('[api-audit]', err.message || err);
      res.status(500);
      return { success: false, error: err.message || String(err) };
    }
  },
};
