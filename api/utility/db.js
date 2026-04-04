/**
 * db.js - SQLite storage layer with better-sqlite3
 *
 * Synchronous, zero-dependency (besides better-sqlite3) local cache.
 * All data is reconstructible from IOTA Tangle — this is just a fast cache.
 *
 * User identity is now the IOTA address (e.g. "0x1234...") instead of "USR_" IDs.
 * The backend is a pure indexer — it does NOT sign or publish transactions.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Part 1: Init + Schema
// ---------------------------------------------------------------------------

// Electron sets FORUM_DATA_DIR to appdata; otherwise use .tmp/
const DB_PATH = process.env.FORUM_DATA_DIR
  ? path.join(process.env.FORUM_DATA_DIR, 'iota-forum.db')
  : path.resolve(__dirname, '../../.tmp/iota-forum.db');

let database = null;

/**
 * Initialize the SQLite database, create tables and indexes, run migrations.
 * @returns {import('better-sqlite3').Database} The initialized database instance
 */
function initDb() {
  if (database) return database;

  // Ensure .tmp directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  database = new Database(DB_PATH);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  // Create tables
  // NOTE: users.id is now the IOTA address (e.g. "0x1234..."), not "USR_XXXX"
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      bio TEXT,
      avatar TEXT,
      publicKey TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      showUsername INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      createdBy TEXT,
      sortOrder INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      categoryId TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      authorId TEXT NOT NULL,
      encrypted INTEGER DEFAULT 0,
      encryptedTitle INTEGER DEFAULT 0,
      keyBundle TEXT,
      pinned INTEGER DEFAULT 0,
      locked INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      lastPostAt INTEGER,
      postCount INTEGER DEFAULT 0,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      threadId TEXT NOT NULL,
      parentId TEXT,
      content TEXT NOT NULL,
      authorId TEXT NOT NULL,
      hidden INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      score INTEGER DEFAULT 0,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS seen_nonces (
      nonce TEXT PRIMARY KEY,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      postId TEXT NOT NULL,
      authorId TEXT NOT NULL,
      vote INTEGER NOT NULL,
      createdAt INTEGER,
      updatedAt INTEGER,
      UNIQUE(postId, authorId)
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      targetUserId TEXT NOT NULL,
      role TEXT NOT NULL,
      categoryId TEXT,
      grantedBy TEXT NOT NULL,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS moderations (
      id TEXT PRIMARY KEY,
      postId TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      moderatorId TEXT NOT NULL,
      entityType TEXT DEFAULT 'post',
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS config (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      baseTheme TEXT,
      overrides TEXT,
      authorId TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      entityId,
      title,
      content,
      tokenize='unicode61'
    );

    -- =====================================================================
    -- New tables for payments, marketplace, escrow, reputation
    -- =====================================================================

    CREATE TABLE IF NOT EXISTS wallets (
      address TEXT PRIMARY KEY,
      userId TEXT,
      funded INTEGER DEFAULT 0,
      fundedAt INTEGER,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      userId TEXT PRIMARY KEY,
      tier INTEGER DEFAULT 0,
      expiresAt INTEGER,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      buyer TEXT NOT NULL,
      seller TEXT NOT NULL,
      arbitrator TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      status INTEGER DEFAULT 0,
      deadline INTEGER,
      createdAt INTEGER,
      resolvedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS reputations (
      userId TEXT PRIMARY KEY,
      totalTrades INTEGER DEFAULT 0,
      successful INTEGER DEFAULT 0,
      disputesWon INTEGER DEFAULT 0,
      disputesLost INTEGER DEFAULT 0,
      totalVolume INTEGER DEFAULT 0,
      ratingSum INTEGER DEFAULT 0,
      ratingCount INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tips (
      id TEXT PRIMARY KEY,
      fromUser TEXT NOT NULL,
      toUser TEXT NOT NULL,
      postId TEXT,
      amount INTEGER NOT NULL,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      buyer TEXT NOT NULL,
      contentId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS badges_config (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER DEFAULT 0,
      icon TEXT,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      userId TEXT NOT NULL,
      badgeId TEXT NOT NULL,
      createdAt INTEGER,
      PRIMARY KEY(userId, badgeId)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      escrowId TEXT NOT NULL,
      rater TEXT NOT NULL,
      rated TEXT NOT NULL,
      score INTEGER NOT NULL,
      comment TEXT,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updatedAt TEXT
    );

    -- =====================================================================
    -- Notifications (in-app notification system)
    -- =====================================================================

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      fromUserId TEXT,
      entityId TEXT,
      message TEXT,
      read INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(userId, read);

    -- =====================================================================
    -- Reactions (emoji reactions on posts)
    -- =====================================================================

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      postId TEXT NOT NULL,
      userId TEXT NOT NULL,
      emoji TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(postId, userId, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_reactions_postId ON reactions(postId);

    -- =====================================================================
    -- Transaction Audit Log (admin monitoring)
    -- =====================================================================

    CREATE TABLE IF NOT EXISTS transaction_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txDigest TEXT,
      tag TEXT NOT NULL,
      entityId TEXT,
      authorId TEXT,
      action TEXT,
      isEncrypted INTEGER DEFAULT 0,
      dataPreview TEXT,
      gasUsed INTEGER,
      timestamp TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_txlog_tag ON transaction_log(tag);
    CREATE INDEX IF NOT EXISTS idx_txlog_author ON transaction_log(authorId);
    CREATE INDEX IF NOT EXISTS idx_txlog_timestamp ON transaction_log(timestamp);

    -- =====================================================================
    -- Direct Messages (encrypted E2E — server stores ciphertext only)
    -- =====================================================================

    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      fromUserId TEXT NOT NULL,
      toUserId TEXT NOT NULL,
      encryptedContent TEXT NOT NULL,
      iv TEXT NOT NULL,
      ephemeralPublicKey TEXT,
      readAt TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_dm_from ON direct_messages(fromUserId);
    CREATE INDEX IF NOT EXISTS idx_dm_to ON direct_messages(toUserId);
    CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(fromUserId, toUserId);

    -- =====================================================================
    -- Social Graph (follows)
    -- =====================================================================

    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      followerId TEXT NOT NULL,
      followingId TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(followerId, followingId)
    );

    CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(followerId);
    CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(followingId);

    -- =====================================================================
    -- Governance (polls & proposals)
    -- =====================================================================

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      creatorId TEXT NOT NULL,
      optionsCount INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      closed INTEGER DEFAULT 0,
      data TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id TEXT PRIMARY KEY,
      pollId TEXT NOT NULL,
      voterId TEXT NOT NULL,
      optionIndex INTEGER NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(pollId, voterId)
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      creatorId TEXT NOT NULL,
      quorum INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      status INTEGER DEFAULT 0,
      data TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proposal_votes (
      id TEXT PRIMARY KEY,
      proposalId TEXT NOT NULL,
      voterId TEXT NOT NULL,
      voteYes INTEGER NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(proposalId, voterId)
    );

    CREATE INDEX IF NOT EXISTS idx_polls_creator ON polls(creatorId);
    CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(pollId);
    CREATE INDEX IF NOT EXISTS idx_proposals_creator ON proposals(creatorId);
    CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal ON proposal_votes(proposalId);
  `);

  // Migration: FTS5 contentless -> standard
  // Old search_index used content='' which silently ignores DELETEs and returns NULL for title/content.
  // Drop and recreate to get a proper FTS5 table with stored content.
  try {
    // Check if existing FTS table is contentless by trying a SELECT - title will be NULL for contentless
    const ftsTest = database.prepare("SELECT title FROM search_index LIMIT 1").get();
    // If we get here and the table exists but was contentless, we need to recreate it
    // A contentless table returns NULL for all content columns even with data
    // The safest approach: drop and let the CREATE VIRTUAL TABLE above recreate it
    // This only runs once — after migration the new table works correctly
  } catch (e) {
    // Table doesn't exist or other error — the CREATE above will handle it
  }
  try {
    // Force recreation: drop old contentless FTS table so the CREATE above takes effect
    // We detect old format by checking if content='' was used (content column returns NULL)
    const testRow = database.prepare("SELECT sql FROM sqlite_master WHERE name = 'search_index'").get();
    if (testRow && testRow.sql && testRow.sql.includes("content=''")) {
      database.exec('DROP TABLE IF EXISTS search_index');
      database.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
          entityId,
          title,
          content,
          tokenize='unicode61'
        )
      `);
      sails.log?.info?.('[db] Migrated search_index from contentless to standard FTS5') || console.log('[db] Migrated search_index from contentless to standard FTS5');
    }
  } catch (e) {
    // FTS5 virtual tables may not appear in sqlite_master with full SQL — try brute force
    try {
      database.exec('DROP TABLE IF EXISTS search_index');
      database.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
          entityId,
          title,
          content,
          tokenize='unicode61'
        )
      `);
    } catch (e2) { /* already in new format */ }
  }

  // Migrations: add columns that may be missing from older DBs
  const userCols = database.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('showUsername')) {
    database.exec('ALTER TABLE users ADD COLUMN showUsername INTEGER DEFAULT 0');
  }

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_threads_category ON threads(categoryId);
    CREATE INDEX IF NOT EXISTS idx_posts_thread ON posts(threadId);
    CREATE INDEX IF NOT EXISTS idx_votes_post ON votes(postId);
    CREATE INDEX IF NOT EXISTS idx_roles_target ON roles(targetUserId);
    CREATE INDEX IF NOT EXISTS idx_posts_createdAt ON posts(createdAt);
    CREATE INDEX IF NOT EXISTS idx_threads_createdAt ON threads(createdAt);
    CREATE INDEX IF NOT EXISTS idx_tips_post ON tips(postId);
    CREATE INDEX IF NOT EXISTS idx_tips_toUser ON tips(toUser);
    CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON purchases(buyer);
    CREATE INDEX IF NOT EXISTS idx_purchases_content ON purchases(contentId);
    CREATE INDEX IF NOT EXISTS idx_escrows_buyer ON escrows(buyer);
    CREATE INDEX IF NOT EXISTS idx_escrows_seller ON escrows(seller);
    CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status);
    CREATE INDEX IF NOT EXISTS idx_ratings_escrow ON ratings(escrowId);
    CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(userId);
  `);

  // Migrations: add missing columns to existing databases
  const migrations = [
    'ALTER TABLE votes ADD COLUMN updatedAt INTEGER',
    'ALTER TABLE users ADD COLUMN version INTEGER DEFAULT 1',
    'ALTER TABLE wallets ADD COLUMN createdAt INTEGER',
    'ALTER TABLE wallets ADD COLUMN updatedAt INTEGER',
  ];
  for (const sql of migrations) {
    try { database.exec(sql); } catch (e) { /* column already exists */ }
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_moderations_post ON moderations(postId);
  `);

  return database;
}

/**
 * Get the active database instance. Throws if initDb() has not been called.
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (!database) throw new Error('Database not initialized — call initDb() first');
  return database;
}

// ---------------------------------------------------------------------------
// Part 2: buildWhere + buildSelect helpers
// ---------------------------------------------------------------------------

function buildWhere(where) {
  if (!where || Object.keys(where).length === 0) {
    return { whereClause: '1=1', whereParams: [] };
  }
  const clauses = [];
  const params = [];
  for (const [key, value] of Object.entries(where)) {
    if (Array.isArray(value)) {
      clauses.push(`${key} IN (${value.map(() => '?').join(', ')})`);
      params.push(...value);
    } else if (value === null || value === undefined) {
      clauses.push(`${key} IS NULL`);
    } else if (typeof value === 'boolean') {
      clauses.push(`${key} = ?`);
      params.push(value ? 1 : 0);
    } else {
      clauses.push(`${key} = ?`);
      params.push(value);
    }
  }
  return { whereClause: clauses.join(' AND '), whereParams: params };
}

function buildSelect(tableName, where, options = {}) {
  const { whereClause, whereParams } = buildWhere(where);
  let sql = `SELECT * FROM ${tableName} WHERE ${whereClause}`;
  if (options.sort) sql += ` ORDER BY ${options.sort}`;
  if (options.limit) sql += ` LIMIT ${parseInt(options.limit)}`;
  if (options.offset) sql += ` OFFSET ${parseInt(options.offset)}`;
  return { sql, params: whereParams };
}

// ---------------------------------------------------------------------------
// Part 3: getModel factory
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Model
 * @property {(where?: Object, options?: {sort?: string, limit?: number, offset?: number}) => Object[]} findAll
 * @property {(where: Object) => Object|null} findOne
 * @property {(data: Object) => Object} create
 * @property {(id: string, data: Object) => Object|null} update
 * @property {(id: string) => void} delete
 * @property {(where?: Object) => number} count
 */

/**
 * Factory that returns a CRUD model for the given SQLite table.
 * @param {string} tableName - Name of the SQLite table
 * @returns {Model}
 */
function getModel(tableName) {
  function toRow(data) {
    const row = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (typeof v === 'boolean') row[k] = v ? 1 : 0;
      else row[k] = v;
    }
    if (!row.createdAt) row.createdAt = Date.now();
    if (!row.updatedAt) row.updatedAt = Date.now();
    return row;
  }

  function fromRow(row) {
    if (!row) return null;
    return { ...row };
  }

  return {
    findAll(where = {}, options = {}) {
      const db = getDb();
      const { sql, params } = buildSelect(tableName, where, options);
      return db.prepare(sql).all(...params).map(fromRow);
    },

    findOne(where) {
      const db = getDb();
      const { sql, params } = buildSelect(tableName, where, { limit: 1 });
      const row = db.prepare(sql).get(...params);
      return fromRow(row);
    },

    create(data) {
      const db = getDb();
      const row = toRow(data);
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(', ');
      const values = cols.map(c => row[c]);
      db.prepare(
        `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`
      ).run(...values);
      return fromRow(row);
    },

    update(id, data) {
      const db = getDb();
      const updates = { ...data, updatedAt: Date.now() };
      for (const [k, v] of Object.entries(updates)) {
        if (typeof v === 'boolean') updates[k] = v ? 1 : 0;
      }
      const setCols = Object.keys(updates);
      const setValues = setCols.map(c => updates[c]);
      db.prepare(
        `UPDATE ${tableName} SET ${setCols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`
      ).run(...setValues, id);
      return this.findOne({ id });
    },

    delete(id) {
      const db = getDb();
      db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
    },

    count(where = {}) {
      const db = getDb();
      const { whereClause, whereParams } = buildWhere(where);
      const row = db.prepare(
        `SELECT COUNT(*) as cnt FROM ${tableName} WHERE ${whereClause}`
      ).get(...whereParams);
      return row.cnt;
    },
  };
}

// ---------------------------------------------------------------------------
// Part 4: Nonce check (anti-replay)
// ---------------------------------------------------------------------------

function checkNonce(nonce) {
  const db = getDb();
  const existing = db.prepare('SELECT nonce FROM seen_nonces WHERE nonce = ?').get(nonce);
  if (existing) return true;
  db.prepare('INSERT INTO seen_nonces (nonce, createdAt) VALUES (?, ?)').run(nonce, Date.now());
  return false;
}

// ---------------------------------------------------------------------------
// Part 5: FTS5 search
// ---------------------------------------------------------------------------

/**
 * Full-text search across threads and posts.
 * @param {string} query - FTS5 match query string
 * @returns {{entityId: string, title: string, content: string}[]}
 */
function searchFts(query) {
  const db = getDb();
  return db.prepare(
    `SELECT entityId, title, content FROM search_index WHERE search_index MATCH ? ORDER BY rank`
  ).all(query);
}

/**
 * Update or insert a full-text search index entry.
 * @param {string} entityId - The entity ID (thread or post ID)
 * @param {string} title - Title text to index
 * @param {string} content - Content text to index
 * @returns {void}
 */
function updateFtsIndex(entityId, title, content) {
  const db = getDb();
  // Standard FTS5 table: DELETE by entityId, then INSERT fresh row
  db.prepare('DELETE FROM search_index WHERE entityId = ?').run(entityId);
  db.prepare('INSERT INTO search_index(entityId, title, content) VALUES(?, ?, ?)').run(entityId, title || '', content || '');
}

/**
 * Remove a full-text search index entry.
 * @param {string} entityId - The entity ID to remove from the index
 * @returns {void}
 */
function removeFtsEntry(entityId) {
  const db = getDb();
  db.prepare('DELETE FROM search_index WHERE entityId = ?').run(entityId);
}

// ---------------------------------------------------------------------------
// Part 5b: sync_state helpers
// ---------------------------------------------------------------------------

/**
 * Get a sync state value by key.
 * @param {string} key - Sync state key (e.g. 'lastEventCursor', 'lastRepairCursor')
 * @returns {string|null} The stored value, or null if not found
 */
function getSyncState(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Set a sync state value (upsert).
 * @param {string} key - Sync state key
 * @param {string} value - Value to store
 * @returns {void}
 */
function setSyncState(key, value) {
  const db = getDb();
  db.prepare(
    `INSERT INTO sync_state (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
  ).run(key, value, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Part 6: Forum-specific queries
// ---------------------------------------------------------------------------

function getCategoryStats() {
  const db = getDb();
  return db.prepare(`
    SELECT
      c.*,
      COALESCE(ts.threadCount, 0) as threadCount,
      COALESCE(ts.postCount, 0) as postCount,
      ts.lastActivity,
      lt.title as lastThreadTitle,
      CASE WHEN lu.showUsername = 1 THEN lu.username ELSE NULL END as lastAuthor,
      lu.showUsername as lastAuthorShowUsername
    FROM categories c
    LEFT JOIN (
      SELECT
        t.categoryId,
        COUNT(DISTINCT t.id) as threadCount,
        COALESCE(SUM(t.postCount), 0) as postCount,
        MAX(COALESCE(t.lastPostAt, t.createdAt)) as lastActivity
      FROM threads t
      WHERE t.hidden = 0
      GROUP BY t.categoryId
    ) ts ON ts.categoryId = c.id
    LEFT JOIN (
      SELECT t2.categoryId, t2.title, t2.authorId,
        ROW_NUMBER() OVER (PARTITION BY t2.categoryId ORDER BY COALESCE(t2.lastPostAt, t2.createdAt) DESC) as rn
      FROM threads t2
      WHERE t2.hidden = 0
    ) lt ON lt.categoryId = c.id AND lt.rn = 1
    LEFT JOIN users lu ON lt.authorId = lu.id
    ORDER BY c.sortOrder ASC, c.createdAt ASC
  `).all();
}

function getThreadsByCategory(categoryId, page = 1, perPage = 20) {
  const db = getDb();
  const offset = (page - 1) * perPage;

  const threads = db.prepare(`
    SELECT
      t.*,
      u.username as authorUsername,
      u.avatar as authorAvatar,
      u.showUsername as authorShowUsername,
      lp.authorId as lastAuthorId,
      lu.username as lastAuthorUsername,
      lu.showUsername as lastAuthorShowUsername
    FROM threads t
    LEFT JOIN users u ON t.authorId = u.id
    LEFT JOIN (
      SELECT threadId, authorId
      FROM posts
      WHERE hidden = 0
      GROUP BY threadId
      HAVING createdAt = MAX(createdAt)
    ) lp ON lp.threadId = t.id
    LEFT JOIN users lu ON lp.authorId = lu.id
    WHERE t.categoryId = ? AND t.hidden = 0
    ORDER BY t.pinned DESC, t.lastPostAt DESC, t.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(categoryId, perPage, offset);

  const total = db.prepare(
    'SELECT COUNT(*) as cnt FROM threads WHERE categoryId = ? AND hidden = 0'
  ).get(categoryId).cnt;

  return { threads, total, page, perPage };
}

function getThreadDetail(threadId) {
  const db = getDb();

  const thread = db.prepare(`
    SELECT
      t.*,
      u.username as authorUsername,
      u.avatar as authorAvatar,
      u.showUsername as authorShowUsername
    FROM threads t
    LEFT JOIN users u ON t.authorId = u.id
    WHERE t.id = ?
  `).get(threadId);

  if (!thread) return null;

  const posts = db.prepare(`
    SELECT
      p.*,
      u.username as authorUsername,
      u.avatar as authorAvatar,
      u.showUsername as authorShowUsername
    FROM posts p
    LEFT JOIN users u ON p.authorId = u.id
    WHERE p.threadId = ?
    ORDER BY p.createdAt ASC
  `).all(threadId);

  // Return flat list — frontend NestedReplies handles nesting by parentId
  return { ...thread, posts };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  initDb,
  getDb,
  getModel,
  checkNonce,
  searchFts,
  updateFtsIndex,
  removeFtsEntry,
  getSyncState,
  setSyncState,
  getCategoryStats,
  getThreadsByCategory,
  getThreadDetail,
};
