/**
 * cache.js - Simple in-memory cache with TTL
 *
 * Lightweight key-value store for caching expensive queries.
 * No external dependencies. All operations are synchronous.
 */

const store = {};

/**
 * Get a cached value by key. Returns null if missing or expired.
 * @param {string} key - Cache key
 * @returns {any|null} Cached data or null if missing/expired
 */
function get(key) {
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete store[key];
    return null;
  }
  return entry.data;
}

/**
 * Set a cached value with a TTL in milliseconds.
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttlMs - Time to live in milliseconds
 * @returns {void}
 */
function set(key, data, ttlMs) {
  store[key] = {
    data,
    expiresAt: Date.now() + ttlMs,
  };
}

/**
 * Invalidate a specific key.
 * @param {string} key - Cache key to invalidate
 * @returns {void}
 */
function invalidate(key) {
  delete store[key];
}

/**
 * Invalidate all keys that start with the given prefix.
 * @param {string} prefix - Key prefix to match
 * @returns {void}
 */
function invalidatePrefix(prefix) {
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) {
      delete store[key];
    }
  }
}

/**
 * Clear the entire cache.
 * @returns {void}
 */
function clear() {
  for (const key of Object.keys(store)) {
    delete store[key];
  }
}

module.exports = { get, set, invalidate, invalidatePrefix, clear };
