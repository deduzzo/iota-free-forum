/**
 * HTTP Server Settings
 * (sails.config.http)
 *
 * Rate limiting middleware for API endpoints.
 * Uses express-rate-limit (already in package.json).
 */

const rateLimit = require('express-rate-limit');

// General API rate limit: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

// Aggressive rate limit for heavy endpoints: 1 request per minute per IP
const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'This endpoint is rate limited. Max 1 request per minute.' },
});

module.exports.http = {
  middleware: {
    order: [
      'cookieParser',
      'session',
      'bodyParser',
      'compress',
      'poweredBy',
      'apiRateLimiter',
      'router',
      'www',
      'favicon',
    ],

    apiRateLimiter: function (req, res, next) {
      // Skip non-API routes (static files, SPA catch-all)
      if (!req.path.startsWith('/api/')) {
        return next();
      }

      // Aggressive limit for heavy endpoints
      if (
        req.path === '/api/v1/integrity-check' ||
        req.path === '/api/v1/export-data' ||
        req.path === '/api/v1/admin/audit/export'
      ) {
        return heavyLimiter(req, res, next);
      }

      // General API rate limit for all other API routes
      return apiLimiter(req, res, next);
    },
  },
};
