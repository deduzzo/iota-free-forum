/**
 * forumManager.test.js - Tests for ForumManager handler logic
 *
 * Mocks blockchain dependencies (iota.js, sails global) but uses a real
 * SQLite database to verify that handlers produce correct state.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';

const require = createRequire(import.meta.url);

// Mock iota module BEFORE requiring ForumManager
vi.mock('../../api/utility/iota', () => ({
  default: {
    setSocketId: vi.fn(),
    isMoveModeEnabled: vi.fn().mockReturnValue(true),
    queryForumEvents: vi.fn().mockResolvedValue({}),
    loadSdk: vi.fn().mockResolvedValue({}),
    getClient: vi.fn().mockResolvedValue({}),
    getKeypair: vi.fn().mockResolvedValue({}),
    clearBulkCache: vi.fn(),
  },
  setSocketId: vi.fn(),
  isMoveModeEnabled: vi.fn().mockReturnValue(true),
  queryForumEvents: vi.fn().mockResolvedValue({}),
  loadSdk: vi.fn().mockResolvedValue({}),
  getClient: vi.fn().mockResolvedValue({}),
  getKeypair: vi.fn().mockResolvedValue({}),
  clearBulkCache: vi.fn(),
}));

let tmpDir;
let db;
let manager; // ForumManager exports a singleton instance

// Mock the global `sails` object that Sails.js injects at runtime
global.sails = {
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    debug: vi.fn(),
  },
  helpers: {
    broadcastEvent: vi.fn().mockResolvedValue(undefined),
  },
  config: {
    custom: {
      rateLimits: {
        post: { windowMs: 10000, max: 1 },
        register: { windowMs: 60000, max: 1 },
        vote: { windowMs: 2000, max: 1 },
        default: { windowMs: 5000, max: 1 },
      },
    },
  },
};

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iotapolis-fm-test-'));
  process.env.FORUM_DATA_DIR = tmpDir;

  // Clear module cache to ensure fresh instances
  delete require.cache[require.resolve('../../api/utility/db')];
  db = require('../../api/utility/db');
  db.initDb();

  // Add missing updatedAt columns that getModel.create() expects
  // These tables were created without updatedAt but the generic model
  // factory always adds it. In production DBs these may exist from migrations.
  const database = db.getDb();
  const tablesToFix = ['roles', 'tips', 'escrows', 'ratings', 'purchases', 'badges_config', 'user_badges'];
  for (const table of tablesToFix) {
    try { database.exec(`ALTER TABLE ${table} ADD COLUMN updatedAt INTEGER`); } catch (e) { /* already exists */ }
  }

  // ForumManager exports a singleton instance (not a class)
  delete require.cache[require.resolve('../../api/utility/ForumManager')];
  manager = require('../../api/utility/ForumManager');
});

afterAll(() => {
  vi.restoreAllMocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) { /* ignore */ }
});

beforeEach(() => {
  const database = db.getDb();
  database.exec(`
    DELETE FROM users;
    DELETE FROM categories;
    DELETE FROM threads;
    DELETE FROM posts;
    DELETE FROM votes;
    DELETE FROM roles;
    DELETE FROM moderations;
    DELETE FROM config;
    DELETE FROM tips;
    DELETE FROM subscriptions;
    DELETE FROM purchases;
    DELETE FROM badges_config;
    DELETE FROM user_badges;
    DELETE FROM escrows;
    DELETE FROM reputations;
    DELETE FROM ratings;
    INSERT INTO search_index(search_index) VALUES('delete-all');
  `);
});

// =========================================================================
// processTransaction routing
// =========================================================================

describe('processTransaction', () => {
  it('should route FORUM_USER to handleForumUser', () => {
    manager.processTransaction('FORUM_USER', {
      id: '0x111',
      username: 'alice',
      bio: 'test bio',
    }, '0x111');

    const user = db.getModel('users').findOne({ id: '0x111' });
    expect(user).not.toBeNull();
    expect(user.username).toBe('alice');
  });

  it('should route FORUM_THREAD to handleForumThread', () => {
    manager.processTransaction('FORUM_USER', {
      id: '0x111', username: 'alice',
    }, '0x111');

    manager.processTransaction('FORUM_THREAD', {
      id: 'THR_1',
      categoryId: 'CAT_1',
      title: 'Test Thread',
      content: 'Thread body',
    }, '0x111');

    const thread = db.getModel('threads').findOne({ id: 'THR_1' });
    expect(thread).not.toBeNull();
    expect(thread.title).toBe('Test Thread');
    expect(thread.authorId).toBe('0x111');
  });

  it('should route FORUM_POST to handleForumPost', () => {
    manager.processTransaction('FORUM_POST', {
      id: 'POST_1',
      threadId: 'THR_1',
      content: 'A reply',
    }, '0x222');

    const post = db.getModel('posts').findOne({ id: 'POST_1' });
    expect(post).not.toBeNull();
    expect(post.authorId).toBe('0x222');
  });

  it('should route FORUM_VOTE to handleForumVote', () => {
    db.getModel('posts').create({
      id: 'POST_VOTE',
      threadId: 'THR_1',
      content: 'Votable post',
      authorId: '0x111',
    });

    manager.processTransaction('FORUM_VOTE', {
      postId: 'POST_VOTE',
      vote: 1,
    }, '0x222');

    const vote = db.getModel('votes').findOne({ postId: 'POST_VOTE', authorId: '0x222' });
    expect(vote).not.toBeNull();
    expect(vote.vote).toBe(1);
  });

  it('should skip unknown tags gracefully', () => {
    expect(() => {
      manager.processTransaction('UNKNOWN_TAG', { data: 'test' }, '0x111');
    }).not.toThrow();
  });
});

// =========================================================================
// eventAuthor takes precedence over data.authorId
// =========================================================================

describe('eventAuthor security', () => {
  it('FORUM_USER: should use eventAuthor as user ID, not data.id', () => {
    manager.processTransaction('FORUM_USER', {
      id: '0xFAKE',
      username: 'attacker',
    }, '0xREAL');

    expect(db.getModel('users').findOne({ id: '0xREAL' })).not.toBeNull();
    expect(db.getModel('users').findOne({ id: '0xFAKE' })).toBeNull();
  });

  it('FORUM_THREAD: should use eventAuthor as authorId', () => {
    manager.processTransaction('FORUM_THREAD', {
      id: 'THR_SEC',
      categoryId: 'CAT_1',
      title: 'Spoofed thread',
      content: 'Content',
      authorId: '0xFAKE_AUTHOR',
    }, '0xREAL_AUTHOR');

    const thread = db.getModel('threads').findOne({ id: 'THR_SEC' });
    expect(thread.authorId).toBe('0xREAL_AUTHOR');
  });

  it('FORUM_POST: should use eventAuthor as authorId', () => {
    manager.processTransaction('FORUM_POST', {
      id: 'POST_SEC',
      threadId: 'THR_1',
      content: 'Spoofed post',
      authorId: '0xFAKE',
    }, '0xREAL_POST_AUTHOR');

    const post = db.getModel('posts').findOne({ id: 'POST_SEC' });
    expect(post.authorId).toBe('0xREAL_POST_AUTHOR');
  });

  it('FORUM_VOTE: should use eventAuthor as voter, not data.authorId', () => {
    db.getModel('posts').create({
      id: 'POST_VSEC',
      threadId: 'THR_1',
      content: 'test',
      authorId: '0x111',
    });

    manager.processTransaction('FORUM_VOTE', {
      postId: 'POST_VSEC',
      vote: 1,
      authorId: '0xFAKE_VOTER',
    }, '0xREAL_VOTER');

    const vote = db.getModel('votes').findOne({ postId: 'POST_VSEC' });
    expect(vote.authorId).toBe('0xREAL_VOTER');
  });

  it('FORUM_ROLE: should use eventAuthor as grantedBy', () => {
    manager.processTransaction('FORUM_ROLE', {
      id: 'ROLE_1',
      targetUserId: '0xTARGET',
      role: 'moderator',
      grantedBy: '0xFAKE_GRANTER',
    }, '0xREAL_ADMIN');

    const role = db.getModel('roles').findOne({ id: 'ROLE_1' });
    expect(role.grantedBy).toBe('0xREAL_ADMIN');
  });

  it('FORUM_TIP: should use eventAuthor as fromUser', () => {
    manager.processTransaction('FORUM_TIP', {
      postId: 'POST_1',
      from: '0xFAKE_SENDER',
      to: '0xRECEIVER',
      amount: 1000,
    }, '0xREAL_SENDER');

    const tips = db.getModel('tips').findAll({});
    expect(tips.length).toBe(1);
    expect(tips[0].fromUser).toBe('0xREAL_SENDER');
  });
});

// =========================================================================
// _updateThreadStats
// =========================================================================

describe('_updateThreadStats', () => {
  it('should calculate postCount and lastPostAt from posts table', () => {
    db.getModel('threads').create({
      id: 'THR_STATS',
      categoryId: 'CAT_1',
      title: 'Stats test',
      content: 'body',
      authorId: '0x111',
      postCount: 0,
      lastPostAt: 0,
    });

    manager.processTransaction('FORUM_POST', {
      id: 'P1', threadId: 'THR_STATS', content: 'Post 1',
      createdAt: 1000,
    }, '0x111');

    manager.processTransaction('FORUM_POST', {
      id: 'P2', threadId: 'THR_STATS', content: 'Post 2',
      createdAt: 2000,
    }, '0x222');

    manager.processTransaction('FORUM_POST', {
      id: 'P3', threadId: 'THR_STATS', content: 'Post 3',
      createdAt: 3000,
    }, '0x333');

    const thread = db.getModel('threads').findOne({ id: 'THR_STATS' });
    expect(thread.postCount).toBe(3);
    expect(thread.lastPostAt).toBe(3000);
  });

  it('should exclude hidden posts from count', () => {
    db.getModel('threads').create({
      id: 'THR_HIDDEN_STATS',
      categoryId: 'CAT_1',
      title: 'Hidden stats',
      content: 'body',
      authorId: '0x111',
      postCount: 0,
      lastPostAt: 0,
    });

    manager.processTransaction('FORUM_POST', {
      id: 'PH1', threadId: 'THR_HIDDEN_STATS', content: 'Visible',
      createdAt: 1000,
    }, '0x111');

    manager.processTransaction('FORUM_POST', {
      id: 'PH2', threadId: 'THR_HIDDEN_STATS', content: 'To hide',
      createdAt: 2000,
    }, '0x222');

    db.getModel('posts').update('PH2', { hidden: 1 });
    manager._updateThreadStats('THR_HIDDEN_STATS');

    const thread = db.getModel('threads').findOne({ id: 'THR_HIDDEN_STATS' });
    expect(thread.postCount).toBe(1);
  });
});

// =========================================================================
// _recalculatePostScore
// =========================================================================

describe('_recalculatePostScore', () => {
  it('should sum all votes for a post', () => {
    db.getModel('posts').create({
      id: 'POST_SCORE',
      threadId: 'THR_1',
      content: 'Scorable',
      authorId: '0x111',
      score: 0,
    });

    manager.processTransaction('FORUM_VOTE', {
      postId: 'POST_SCORE', vote: 1,
    }, '0xV1');

    manager.processTransaction('FORUM_VOTE', {
      postId: 'POST_SCORE', vote: 1,
    }, '0xV2');

    manager.processTransaction('FORUM_VOTE', {
      postId: 'POST_SCORE', vote: -1,
    }, '0xV3');

    const post = db.getModel('posts').findOne({ id: 'POST_SCORE' });
    expect(post.score).toBe(1); // 1 + 1 - 1 = 1
  });

  it('should update score when a vote changes', () => {
    db.getModel('posts').create({
      id: 'POST_CHANGE',
      threadId: 'THR_1',
      content: 'Change vote',
      authorId: '0x111',
      score: 0,
    });

    manager.processTransaction('FORUM_VOTE', {
      postId: 'POST_CHANGE', vote: 1,
    }, '0xVOTER');

    expect(db.getModel('posts').findOne({ id: 'POST_CHANGE' }).score).toBe(1);

    manager.processTransaction('FORUM_VOTE', {
      postId: 'POST_CHANGE', vote: -1,
    }, '0xVOTER');

    expect(db.getModel('posts').findOne({ id: 'POST_CHANGE' }).score).toBe(-1);
  });
});

// =========================================================================
// handleForumModeration
// =========================================================================

describe('handleForumModeration', () => {
  it('should hide a post when action is "hide"', () => {
    db.getModel('posts').create({
      id: 'POST_MOD',
      threadId: 'THR_1',
      content: 'Visible post',
      authorId: '0x111',
      hidden: 0,
    });

    manager.processTransaction('FORUM_MODERATION', {
      id: 'MOD_1',
      postId: 'POST_MOD',
      action: 'hide',
      reason: 'Spam',
    }, '0xMOD');

    const post = db.getModel('posts').findOne({ id: 'POST_MOD' });
    expect(post.hidden).toBe(1);

    const mod = db.getModel('moderations').findOne({ id: 'MOD_1' });
    expect(mod.moderatorId).toBe('0xMOD');
    expect(mod.action).toBe('hide');
  });

  it('should unhide a post when action is "unhide"', () => {
    db.getModel('posts').create({
      id: 'POST_UNHIDE',
      threadId: 'THR_1',
      content: 'Hidden post',
      authorId: '0x111',
      hidden: 1,
    });

    manager.processTransaction('FORUM_MODERATION', {
      id: 'MOD_2',
      postId: 'POST_UNHIDE',
      action: 'unhide',
    }, '0xMOD');

    const post = db.getModel('posts').findOne({ id: 'POST_UNHIDE' });
    expect(post.hidden).toBe(0);
  });

  it('should hide a thread when action is "hide" and target is a thread', () => {
    db.getModel('threads').create({
      id: 'THR_MOD',
      categoryId: 'CAT_1',
      title: 'Moderable thread',
      content: 'Content',
      authorId: '0x111',
      hidden: 0,
    });

    manager.processTransaction('FORUM_MODERATION', {
      id: 'MOD_3',
      postId: 'THR_MOD',
      action: 'hide',
    }, '0xMOD');

    const thread = db.getModel('threads').findOne({ id: 'THR_MOD' });
    expect(thread.hidden).toBe(1);
  });

  it('should lock a thread', () => {
    db.getModel('threads').create({
      id: 'THR_LOCK',
      categoryId: 'CAT_1',
      title: 'Lockable',
      content: 'Content',
      authorId: '0x111',
      locked: 0,
    });

    manager.processTransaction('FORUM_MODERATION', {
      id: 'MOD_LOCK',
      postId: 'THR_LOCK',
      threadId: 'THR_LOCK',
      action: 'lock',
    }, '0xMOD');

    const thread = db.getModel('threads').findOne({ id: 'THR_LOCK' });
    expect(thread.locked).toBe(1);
  });

  it('should pin a thread', () => {
    db.getModel('threads').create({
      id: 'THR_PIN',
      categoryId: 'CAT_1',
      title: 'Pinnable',
      content: 'Content',
      authorId: '0x111',
      pinned: 0,
    });

    manager.processTransaction('FORUM_MODERATION', {
      id: 'MOD_PIN',
      postId: 'THR_PIN',
      threadId: 'THR_PIN',
      action: 'pin',
    }, '0xMOD');

    const thread = db.getModel('threads').findOne({ id: 'THR_PIN' });
    expect(thread.pinned).toBe(1);
  });
});

// =========================================================================
// Version-aware updates
// =========================================================================

describe('version-aware updates', () => {
  it('should skip user update if incoming version is not higher', () => {
    // Create user (defaults to version=1 from schema)
    manager.processTransaction('FORUM_USER', {
      id: '0xVER', username: 'v1',
    }, '0xVER');

    // Update to version 2
    manager.processTransaction('FORUM_USER', {
      id: '0xVER', username: 'v2_name', version: 2,
    }, '0xVER');
    expect(db.getModel('users').findOne({ id: '0xVER' }).username).toBe('v2_name');

    // Try updating with same version 2 — should be skipped
    manager.processTransaction('FORUM_USER', {
      id: '0xVER', username: 'v2_attempt', version: 2,
    }, '0xVER');

    const user = db.getModel('users').findOne({ id: '0xVER' });
    expect(user.username).toBe('v2_name');
  });

  it('should apply user update with higher version', () => {
    manager.processTransaction('FORUM_USER', {
      id: '0xVER2', username: 'old_name',
    }, '0xVER2');

    manager.processTransaction('FORUM_USER', {
      id: '0xVER2', username: 'new_name', version: 2,
    }, '0xVER2');

    const user = db.getModel('users').findOne({ id: '0xVER2' });
    expect(user.username).toBe('new_name');
  });

  it('should skip thread update with older version', () => {
    manager.processTransaction('FORUM_THREAD', {
      id: 'THR_VER', categoryId: 'CAT_1', title: 'V2 Title', content: 'body', version: 2,
    }, '0x111');

    manager.processTransaction('FORUM_THREAD', {
      id: 'THR_VER', categoryId: 'CAT_1', title: 'V1 Title', content: 'body', version: 1,
    }, '0x111');

    const thread = db.getModel('threads').findOne({ id: 'THR_VER' });
    expect(thread.title).toBe('V2 Title');
  });
});

// =========================================================================
// Payment handlers
// =========================================================================

describe('payment handlers', () => {
  it('handleEscrowCreated: should create an escrow record', () => {
    manager.processTransaction('FORUM_ESCROW_CREATED', {
      id: 'ESC_1',
      seller: '0xSELLER',
      arbitrator: '0xARB',
      amount: 5000,
      description: 'Test service',
    }, '0xBUYER');

    const escrow = db.getModel('escrows').findOne({ id: 'ESC_1' });
    expect(escrow).not.toBeNull();
    expect(escrow.buyer).toBe('0xBUYER');
    expect(escrow.seller).toBe('0xSELLER');
    expect(escrow.status).toBe(0);
  });

  it('handleRatingEvent: should create rating and update reputation', () => {
    manager.processTransaction('FORUM_RATING', {
      escrowId: 'ESC_1',
      rated: '0xSELLER',
      score: 5,
      comment: 'Great service',
    }, '0xBUYER');

    const ratings = db.getModel('ratings').findAll({});
    expect(ratings.length).toBe(1);
    expect(ratings[0].rater).toBe('0xBUYER');
    expect(ratings[0].score).toBe(5);

    const rep = db.getDb().prepare('SELECT * FROM reputations WHERE userId = ?').get('0xSELLER');
    expect(rep).not.toBeNull();
    expect(rep.totalTrades).toBe(1);
    expect(rep.ratingSum).toBe(5);
    expect(rep.successful).toBe(1);
  });

  it('handlePurchaseEvent: should use eventAuthor as buyer', () => {
    manager.processTransaction('FORUM_PURCHASE', {
      contentId: 'CONTENT_1',
      amount: 2000,
      buyer: '0xFAKE',
    }, '0xREAL_BUYER');

    const purchases = db.getModel('purchases').findAll({});
    expect(purchases.length).toBe(1);
    expect(purchases[0].buyer).toBe('0xREAL_BUYER');
  });
});

// =========================================================================
// First user becomes admin
// =========================================================================

describe('first user admin promotion', () => {
  it('should assign admin role to the first registered user', () => {
    manager.processTransaction('FORUM_USER', {
      id: '0xFIRST',
      username: 'first_user',
    }, '0xFIRST');

    const user = db.getModel('users').findOne({ id: '0xFIRST' });
    expect(user.role).toBe('admin');
  });

  it('should assign user role to subsequent users', () => {
    manager.processTransaction('FORUM_USER', {
      id: '0xFIRST2',
      username: 'first',
    }, '0xFIRST2');

    manager.processTransaction('FORUM_USER', {
      id: '0xSECOND',
      username: 'second',
    }, '0xSECOND');

    expect(db.getModel('users').findOne({ id: '0xFIRST2' }).role).toBe('admin');
    expect(db.getModel('users').findOne({ id: '0xSECOND' }).role).toBe('user');
  });
});
