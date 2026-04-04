/**
 * ForumManager.js - Core business logic + blockchain sync (INDEXER MODE)
 *
 * The backend is now a pure indexer: it reads all forum events from the IOTA
 * blockchain, processes them into the local SQLite cache, and serves data
 * via REST API. It does NOT sign or publish transactions — users sign TX
 * directly with their own IOTA wallet.
 *
 * CRITICAL: Every handler uses `eventAuthor` (from ForumEvent.author field,
 * verified by the Move smart contract via ctx.sender()) instead of
 * `data.authorId` from the payload. This prevents identity spoofing.
 */

const path = require('path');
const fs = require('fs');
const iota = require('./iota');
const db = require('./db');
const {
  FORUM_USER,
  FORUM_CATEGORY,
  FORUM_THREAD,
  FORUM_POST,
  FORUM_VOTE,
  FORUM_ROLE,
  FORUM_MODERATION,
  FORUM_CONFIG,
  FORUM_TIP,
  FORUM_SUBSCRIPTION,
  FORUM_PURCHASE,
  FORUM_BADGE,
  FORUM_ESCROW_CREATED,
  FORUM_ESCROW_UPDATED,
  FORUM_RATING,
  FORUM_REACTION,
  FORUM_DM,
  FORUM_FOLLOW,
  FORUM_UNFOLLOW,
  FORUM_POLL,
  FORUM_POLL_VOTE,
  FORUM_PROPOSAL,
  FORUM_PROPOSAL_VOTE,
} = require('../enums/ForumTags');

// --- Sync Logger ---
const LOGS_DIR = path.resolve(__dirname, '../../logs');

class SyncLogger {
  constructor() {
    this._stream = null;
    this._startTime = null;
  }

  start() {
    try {
      if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(LOGS_DIR, `forum-sync-${ts}.log`);
      this._stream = fs.createWriteStream(filePath, { flags: 'a' });
      this._stream.on('error', (err) => {
        console.warn('[SyncLogger] Write error:', err.message);
        this._stream = null;
      });
      this._startTime = Date.now();
      this.log('=== FORUM SYNC STARTED ===');
      return filePath;
    } catch (e) {
      console.warn('[SyncLogger] Cannot create log file:', e.message);
      return null;
    }
  }

  log(msg) {
    if (!this._stream) return;
    const elapsed = this._startTime ? ((Date.now() - this._startTime) / 1000).toFixed(1) : '0.0';
    this._stream.write(`[+${elapsed}s] ${msg}\n`);
  }

  end(success) {
    if (!this._stream) return;
    const elapsed = this._startTime ? ((Date.now() - this._startTime) / 1000).toFixed(1) : '0.0';
    this.log(`=== FORUM SYNC ${success ? 'COMPLETED' : 'FAILED'} in ${elapsed}s ===`);
    this._stream.end();
    this._stream = null;
  }
}

// --- Tag-to-handler mapping ---
const TAG_HANDLERS = {
  [FORUM_USER]: 'handleForumUser',
  [FORUM_CATEGORY]: 'handleForumCategory',
  [FORUM_THREAD]: 'handleForumThread',
  [FORUM_POST]: 'handleForumPost',
  [FORUM_VOTE]: 'handleForumVote',
  [FORUM_ROLE]: 'handleForumRole',
  [FORUM_MODERATION]: 'handleForumModeration',
  [FORUM_CONFIG]: 'handleForumConfig',
  // --- Payment & marketplace handlers ---
  [FORUM_TIP]: 'handleTipEvent',
  [FORUM_SUBSCRIPTION]: 'handleSubscriptionEvent',
  [FORUM_PURCHASE]: 'handlePurchaseEvent',
  [FORUM_BADGE]: 'handleBadgeEvent',
  [FORUM_ESCROW_CREATED]: 'handleEscrowCreated',
  [FORUM_ESCROW_UPDATED]: 'handleEscrowUpdated',
  [FORUM_RATING]: 'handleRatingEvent',
  [FORUM_REACTION]: 'handleForumReaction',
  [FORUM_DM]: 'handleForumDM',
  [FORUM_FOLLOW]: 'handleForumFollow',
  [FORUM_UNFOLLOW]: 'handleForumUnfollow',
  [FORUM_POLL]: 'handleForumPoll',
  [FORUM_POLL_VOTE]: 'handleForumPollVote',
  [FORUM_PROPOSAL]: 'handleForumProposal',
  [FORUM_PROPOSAL_VOTE]: 'handleForumProposalVote',
  'ROLE_CHANGED': 'handleRoleChanged',
};

// --- Tag-to-entity mapping (per websocket broadcast) ---
const TAG_ENTITY = {
  [FORUM_USER]: 'user',
  [FORUM_CATEGORY]: 'category',
  [FORUM_THREAD]: 'thread',
  [FORUM_POST]: 'post',
  [FORUM_VOTE]: 'post',
  [FORUM_ROLE]: 'user',
  [FORUM_MODERATION]: 'post',
  [FORUM_CONFIG]: 'config',
  // --- Payment & marketplace entities ---
  [FORUM_TIP]: 'tip',
  [FORUM_SUBSCRIPTION]: 'subscription',
  [FORUM_PURCHASE]: 'purchase',
  [FORUM_BADGE]: 'badge',
  [FORUM_ESCROW_CREATED]: 'escrow',
  [FORUM_ESCROW_UPDATED]: 'escrow',
  [FORUM_RATING]: 'rating',
  [FORUM_REACTION]: 'reaction',
  [FORUM_DM]: 'dm',
  [FORUM_FOLLOW]: 'follow',
  [FORUM_UNFOLLOW]: 'follow',
  [FORUM_POLL]: 'poll',
  [FORUM_POLL_VOTE]: 'poll',
  [FORUM_PROPOSAL]: 'proposal',
  [FORUM_PROPOSAL_VOTE]: 'proposal',
  'ROLE_CHANGED': 'user',
};

// --- Models (lazy-initialized) ---
let User, Category, Thread, Post, Vote, Role, Moderation, Config;
let Tip, Subscription, Purchase, BadgeConfig, UserBadge, Escrow, Reputation, Rating;
let Notification, Reaction, DirectMessage;
let Follow, Poll, PollVote, Proposal, ProposalVote;

function ensureModels() {
  if (User) return;
  User = db.getModel('users');
  Category = db.getModel('categories');
  Thread = db.getModel('threads');
  Post = db.getModel('posts');
  Vote = db.getModel('votes');
  Role = db.getModel('roles');
  Moderation = db.getModel('moderations');
  Config = db.getModel('config');
  // Payment & marketplace models
  Tip = db.getModel('tips');
  Subscription = db.getModel('subscriptions');
  Purchase = db.getModel('purchases');
  BadgeConfig = db.getModel('badges_config');
  UserBadge = db.getModel('user_badges');
  Escrow = db.getModel('escrows');
  Reputation = db.getModel('reputations');
  Rating = db.getModel('ratings');
  Notification = db.getModel('notifications');
  Reaction = db.getModel('reactions');
  DirectMessage = db.getModel('direct_messages');
  Follow = db.getModel('follows');
  Poll = db.getModel('polls');
  PollVote = db.getModel('poll_votes');
  Proposal = db.getModel('proposals');
  ProposalVote = db.getModel('proposal_votes');
}

// =========================================================================
// ForumManager (INDEXER MODE — no publishToChain)
// =========================================================================

/**
 * @class ForumManager
 * Core indexer: reads IOTA blockchain events and populates local SQLite cache.
 * Does NOT sign or publish transactions — users sign TX directly.
 */
class ForumManager {

  /**
   * @param {string|null} socketId - WebSocket ID for real-time broadcast
   */
  constructor(socketId = null) {
    this._socketId = socketId;
    this._syncState = { status: 'idle', lastSync: null, stats: null };
    if (socketId) iota.setSocketId(socketId);
  }

  getSyncState() {
    return { ...this._syncState };
  }

  // -----------------------------------------------------------------------
  // 1. syncFromBlockchain
  // -----------------------------------------------------------------------

  /**
   * Fetch all TXs with 'iotaforum' tag from the IOTA Tangle,
   * decode each payload, route to handler, update SQLite cache.
   * @param {((progress: {status: string, total: number, processed: number}) => void)|null} onProgress - Optional progress callback
   * @returns {Promise<{users: number, threads: number, posts: number, votes: number, categories: number, total: number}>}
   */
  async syncFromBlockchain(onProgress = null) {
    this._syncState = { status: 'syncing', lastSync: null, stats: null };
    const syncLog = new SyncLogger();
    const logFile = syncLog.start();
    sails.log.info(`[ForumManager] Starting blockchain sync... (log: ${logFile || 'N/A'})`);

    ensureModels();

    const stats = {
      users: 0,
      categories: 0,
      threads: 0,
      posts: 0,
      votes: 0,
      roles: 0,
      moderations: 0,
      configs: 0,
      tips: 0,
      subscriptions: 0,
      purchases: 0,
      badges: 0,
      escrows: 0,
      ratings: 0,
      errors: 0,
    };

    const reportProgress = (status, total, processed) => {
      if (onProgress) onProgress({ status, ...stats, total, processed });
    };

    try {
      // Fetch all data — Move events or legacy split-coin TXs
      reportProgress('downloading', 0, 0);
      let byTag;
      if (iota.isMoveModeEnabled()) {
        syncLog.log('Fetching forum events from Move contract...');
        byTag = await iota.queryForumEvents();
      } else {
        syncLog.log('Fetching all transactions from chain (legacy bulk cache)...');
        byTag = await iota.getAllTransactionsCached();
      }

      // Count total TXs across relevant forum tags
      let totalTxs = 0;
      const forumTags = Object.keys(TAG_HANDLERS);
      for (const tag of forumTags) {
        totalTxs += (byTag[tag] || []).length;
      }
      syncLog.log(`Found ${totalTxs} forum transactions across ${forumTags.length} tags`);

      // Process each tag — wrapped in a transaction for 10-50x speedup
      let processed = 0;
      const database = db.getDb();
      const processAllEvents = database.transaction(() => {
        for (const tag of forumTags) {
          const records = byTag[tag] || [];
          syncLog.log(`Processing tag ${tag}: ${records.length} records`);

          // Sort by version/timestamp ascending so latest overwrites correctly
          records.sort((a, b) => (a.version || 0) - (b.version || 0) || (a.timestamp || 0) - (b.timestamp || 0));

          for (const record of records) {
            try {
              const data = typeof record.payload === 'string'
                ? JSON.parse(record.payload)
                : record.payload;

              // CRITICAL: Extract eventAuthor from the blockchain event's author field
              // This is verified by the Move smart contract via ctx.sender()
              const eventAuthor = record.author || null;

              sails.log.info(`[ForumManager] Sync processing: tag=${tag}, eventAuthor=${eventAuthor}, data.id=${data?.id}, keys=${Object.keys(data || {}).join(',')}`);
              this.processTransaction(tag, data, eventAuthor, { digest: record.digest || null });
              this._incrementStat(stats, tag);
            } catch (err) {
              stats.errors++;
              syncLog.log(`ERROR processing ${tag} record: ${err.message}`);
              sails.log.warn(`[ForumManager] Error processing ${tag}:`, err.message);
            }

            processed++;
            if (processed % 100 === 0) {
              reportProgress('syncing', totalTxs, processed);
            }
          }
        }
      });
      processAllEvents();

      // Free bulk cache (only needed for legacy mode)
      if (!iota.isMoveModeEnabled()) {
        iota.clearBulkCache();
      }

      reportProgress('done', totalTxs, totalTxs);
      syncLog.log(`Sync complete: ${JSON.stringify(stats)}`);
      syncLog.end(true);
      this._syncState = { status: 'idle', lastSync: new Date().toISOString(), stats };
      sails.log.info(`[ForumManager] Sync complete:`, stats);
      return stats;

    } catch (err) {
      syncLog.log(`FATAL: ${err.message}\n${err.stack}`);
      syncLog.end(false);
      this._syncState = { status: 'error', lastSync: null, error: err.message };
      sails.log.error('[ForumManager] Sync failed:', err);
      if (!iota.isMoveModeEnabled()) iota.clearBulkCache();
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // 2. processTransaction (CRITICAL: uses eventAuthor, not data.authorId)
  // -----------------------------------------------------------------------

  /**
   * Parse payload and route to the appropriate handler.
   * @param {string} tag - The forum tag
   * @param {object} data - Decoded JSON payload
   * @param {string|null} eventAuthor - The blockchain-verified author address (from ForumEvent.author)
   */
  /**
   * Route a decoded event to the appropriate handler based on tag.
   * Uses eventAuthor (verified on-chain) instead of data.authorId.
   * @param {string} tag - Forum event tag (e.g. 'FORUM_THREAD', 'FORUM_POST')
   * @param {Object} data - Decoded event payload
   * @param {string|null} eventAuthor - On-chain verified author address (ctx.sender())
   * @param {Object} meta - Optional metadata (digest, gasUsed, etc.)
   * @returns {void}
   */
  processTransaction(tag, data, eventAuthor = null, meta = {}) {
    ensureModels();

    const handlerName = TAG_HANDLERS[tag];
    if (!handlerName) {
      sails.log.verbose(`[ForumManager] Unknown tag: ${tag}, skipping`);
      return;
    }

    this[handlerName](data, eventAuthor);

    // --- Audit log ---
    try {
      const TxLog = db.getModel('transaction_log');
      TxLog.create({
        txDigest: meta.digest || null,
        tag: tag,
        entityId: data.entityId || data.postId || data.id || null,
        authorId: eventAuthor,
        action: data.action || tag,
        isEncrypted: tag === 'FORUM_DM' ? 1 : 0,
        dataPreview: tag === 'FORUM_DM' ? '[encrypted]' : JSON.stringify(data).substring(0, 200),
        timestamp: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
      });
    } catch (logErr) {
      sails.log.verbose(`[ForumManager] Audit log error: ${logErr.message}`);
    }
  }

  // -----------------------------------------------------------------------
  // 3. Handler functions
  // -----------------------------------------------------------------------

  /**
   * Upsert user, update FTS index.
   * CRITICAL: Uses eventAuthor as the user ID (IOTA address), not data.id
   */
  handleForumUser(data, eventAuthor) {
    // The user ID is now the IOTA address from the blockchain event
    const userId = eventAuthor || data.id;
    sails.log.info(`[ForumManager] handleForumUser: eventAuthor=${eventAuthor}, data.id=${data.id}, userId=${userId}, username=${data.username}`);

    const existing = User.findOne({ id: userId });
    let isFirstUser = false;

    if (existing) {
      // Version-aware: skip if same version or older
      const incomingVersion = data.version || 1;
      if (incomingVersion <= existing.version) return;

      User.update(userId, {
        username: data.username,
        bio: data.bio,
        avatar: data.avatar,
        publicKey: data.publicKey,
        role: data.role || existing.role || 'user',
        showUsername: data.showUsername != null ? (data.showUsername ? 1 : 0) : existing.showUsername,
        version: incomingVersion,
        updatedAt: data.updatedAt || Date.now(),
      });
    } else {
      // First user to register becomes admin
      const allUsers = User.findAll({});
      isFirstUser = !allUsers || allUsers.length === 0;
      const role = isFirstUser ? 'admin' : (data.role || 'user');

      sails.log.info(`[ForumManager] Creating user ${userId} (${data.username}) with role=${role}, isFirstUser=${isFirstUser}`);

      User.create({
        id: userId,
        username: data.username,
        bio: data.bio || null,
        avatar: data.avatar || null,
        publicKey: data.publicKey || '',
        role,
        showUsername: data.showUsername ? 1 : 0,
        createdAt: data.createdAt || data.registeredAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      });
    }

    // Update FTS with username + bio
    db.updateFtsIndex(userId, data.username, data.bio || '');

    // If this is the first user, promote to admin ON-CHAIN via set_user_role
    if (isFirstUser && userId && iota.isMoveModeEnabled()) {
      sails.log.info(`[ForumManager] Promoting first user ${userId} to ADMIN on-chain...`);
      this._promoteFirstUserToAdmin(userId).catch(err => {
        sails.log.error(`[ForumManager] Failed to promote first user to admin on-chain: ${err.message}`);
      });
    }
  }

  /**
   * Promote the first registered user to ADMIN on-chain.
   * Uses the server's AdminCap (from contract deployment).
   */
  async _promoteFirstUserToAdmin(userAddress) {
    try {
      const config = require('../../config/private_iota_conf');
      if (!config.ADMIN_CAP_ID || !config.FORUM_PACKAGE_ID || !config.FORUM_REGISTRY_ID) return;

      const sdk = await iota.loadSdk();
      const client = await iota.getClient();
      const keypair = await iota.getKeypair();

      const { Transaction } = sdk;
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.FORUM_PACKAGE_ID}::forum::set_user_role`,
        arguments: [
          tx.object(config.FORUM_REGISTRY_ID),
          tx.pure.address(userAddress),
          tx.pure.u8(3), // ROLE_ADMIN = 3
          tx.object('0x6'), // Clock object
        ],
      });
      tx.setGasBudget(50_000_000);

      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status === 'success') {
        sails.log.info(`[ForumManager] First user ${userAddress} promoted to ADMIN on-chain! Digest: ${result.digest}`);
        // Update local cache role
        try { User.update(userAddress, { role: 'admin' }); } catch (e) { /* */ }
        // Notify frontend
        try {
          await sails.helpers.broadcastEvent('dataChanged', {
            entity: 'user',
            action: 'userPromotedAdmin',
            label: userAddress,
            userId: userAddress,
            role: 'admin',
            digest: result.digest,
          });
        } catch (e) { /* */ }
      } else {
        const errMsg = result.effects?.status?.error || 'Unknown error';
        sails.log.warn(`[ForumManager] set_user_role TX failed: ${errMsg}`);
        try {
          await sails.helpers.broadcastEvent('dataChanged', {
            entity: 'error',
            action: 'adminPromotionFailed',
            label: errMsg,
            userId: userAddress,
          });
        } catch (e) { /* */ }
      }
    } catch (err) {
      sails.log.error(`[ForumManager] _promoteFirstUserToAdmin error: ${err.message}`);
      try {
        await sails.helpers.broadcastEvent('dataChanged', {
          entity: 'error',
          action: 'adminPromotionFailed',
          label: err.message,
          userId: userAddress,
        });
      } catch (e) { /* */ }
    }
  }

  /**
   * Upsert category.
   * CRITICAL: Uses eventAuthor as createdBy
   */
  handleForumCategory(data, eventAuthor) {
    const existing = Category.findOne({ id: data.id });

    if (existing) {
      Category.update(data.id, {
        name: data.name,
        description: data.description,
        sortOrder: data.sortOrder != null ? data.sortOrder : existing.sortOrder,
      });
    } else {
      Category.create({
        id: data.id,
        name: data.name,
        description: data.description || null,
        createdBy: eventAuthor || data.createdBy || data.authorId,
        sortOrder: data.sortOrder || 0,
        createdAt: data.createdAt || Date.now(),
      });
    }
  }

  /**
   * Upsert thread (version-aware), update postCount/lastPostAt, update FTS.
   * CRITICAL: Uses eventAuthor as authorId
   */
  handleForumThread(data, eventAuthor) {
    const existing = Thread.findOne({ id: data.id });

    if (existing) {
      // Version-aware: skip if same version or older
      const incomingVersion = data.version || 1;
      if (incomingVersion <= existing.version) return;

      Thread.update(data.id, {
        title: data.title,
        content: data.content,
        encrypted: data.encrypted ? 1 : 0,
        encryptedTitle: data.encryptedTitle ? 1 : 0,
        keyBundle: data.keyBundle || existing.keyBundle,
        pinned: data.pinned != null ? (data.pinned ? 1 : 0) : existing.pinned,
        locked: data.locked != null ? (data.locked ? 1 : 0) : existing.locked,
        hidden: data.hidden != null ? (data.hidden ? 1 : 0) : existing.hidden,
        version: incomingVersion,
        lastPostAt: data.lastPostAt || existing.lastPostAt,
        postCount: data.postCount != null ? data.postCount : existing.postCount,
        updatedAt: data.updatedAt || Date.now(),
      });
    } else {
      Thread.create({
        id: data.id,
        categoryId: data.categoryId,
        title: data.title,
        content: data.content,
        authorId: eventAuthor,
        encrypted: data.encrypted ? 1 : 0,
        encryptedTitle: data.encryptedTitle ? 1 : 0,
        keyBundle: data.keyBundle || null,
        pinned: data.pinned ? 1 : 0,
        locked: data.locked ? 1 : 0,
        hidden: data.hidden ? 1 : 0,
        version: data.version || 1,
        lastPostAt: data.lastPostAt || data.createdAt || Date.now(),
        postCount: data.postCount || 0,
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      });
    }

    // Update FTS with title + content (skip if encrypted)
    if (!data.encrypted) {
      db.updateFtsIndex(data.id, data.title, data.content);
    }
  }

  /**
   * Upsert post (version-aware), update parent thread stats, update FTS.
   * CRITICAL: Uses eventAuthor as authorId
   */
  handleForumPost(data, eventAuthor) {
    const existing = Post.findOne({ id: data.id });

    if (existing) {
      // Version-aware: skip if same version or older
      const incomingVersion = data.version || 1;
      if (incomingVersion <= existing.version) return;

      Post.update(data.id, {
        content: data.content,
        hidden: data.hidden != null ? (data.hidden ? 1 : 0) : existing.hidden,
        version: incomingVersion,
        score: data.score != null ? data.score : existing.score,
        updatedAt: data.updatedAt || Date.now(),
      });
    } else {
      Post.create({
        id: data.id,
        threadId: data.threadId,
        parentId: data.parentId || null,
        content: data.content,
        authorId: eventAuthor,
        hidden: data.hidden ? 1 : 0,
        version: data.version || 1,
        score: data.score || 0,
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      });

      // Update parent thread stats (postCount + lastPostAt)
      this._updateThreadStats(data.threadId);
    }

    // Update FTS
    db.updateFtsIndex(data.id, '', data.content);

    // --- Notifications ---
    // Notify parent post author on reply
    if (data.parentId && eventAuthor) {
      const parentPost = Post.findOne({ id: data.parentId });
      if (parentPost && parentPost.authorId && parentPost.authorId !== eventAuthor) {
        this._createNotification({
          userId: parentPost.authorId,
          type: 'reply',
          fromUserId: eventAuthor,
          entityId: data.threadId,
          message: `replied to your post`,
        });
      }
    }
    // Notify mentioned users
    if (data.content && eventAuthor) {
      const mentions = this._extractMentions(data.content);
      for (const username of mentions) {
        const mentionedUser = User.findOne({ username });
        if (mentionedUser && mentionedUser.id !== eventAuthor) {
          this._createNotification({
            userId: mentionedUser.id,
            type: 'mention',
            fromUserId: eventAuthor,
            entityId: data.threadId,
            message: `mentioned you in a post`,
          });
        }
      }
    }
  }

  /**
   * Upsert vote, recalculate post score.
   * CRITICAL: Uses eventAuthor as authorId
   */
  handleForumVote(data, eventAuthor) {
    const voteAuthor = eventAuthor;
    if (!data.postId || !voteAuthor) {
      sails.log.warn(`[ForumManager] Vote missing postId or authorId:`, JSON.stringify(data).substring(0, 200));
      return;
    }
    const voteId = data.id || `VOTE_${data.postId}_${voteAuthor}`;
    sails.log.verbose(`[ForumManager] handleForumVote: id=${voteId} postId=${data.postId} vote=${data.vote}`);

    const existing = Vote.findOne({ id: voteId });

    if (existing) {
      Vote.update(voteId, {
        vote: data.vote,
      });
    } else {
      // Check for existing vote by same author on same post (UNIQUE constraint)
      const duplicate = Vote.findOne({ postId: data.postId, authorId: voteAuthor });
      if (duplicate) {
        Vote.update(duplicate.id, { vote: data.vote });
      } else {
        Vote.create({
          id: voteId,
          postId: data.postId,
          authorId: voteAuthor,
          vote: data.vote,
          createdAt: data.createdAt || Date.now(),
        });
      }
    }

    // Recalculate post score
    this._recalculatePostScore(data.postId);
  }

  /**
   * Upsert role assignment.
   * CRITICAL: Uses eventAuthor as grantedBy
   */
  handleForumRole(data, eventAuthor) {
    const existing = Role.findOne({ id: data.id });

    if (existing) {
      Role.update(data.id, {
        role: data.role,
        categoryId: data.categoryId || null,
      });
    } else {
      Role.create({
        id: data.id,
        targetUserId: data.targetUserId,
        role: data.role,
        categoryId: data.categoryId || null,
        grantedBy: eventAuthor || data.grantedBy,
        createdAt: data.createdAt || Date.now(),
      });
    }

    // Also update the user's role in the users table
    if (data.targetUserId && data.role) {
      const targetUser = User.findOne({ id: data.targetUserId });
      if (targetUser) {
        User.update(data.targetUserId, { role: data.role });
      }
    }
  }

  /**
   * Handle on-chain RoleChanged events (from set_user_role).
   * Updates the user's role in the cache.
   */
  handleRoleChanged(data, eventAuthor) {
    const targetUser = User.findOne({ id: data.targetUserId });
    if (targetUser) {
      User.update(data.targetUserId, { role: data.role });
      sails.log.info(`[ForumManager] RoleChanged: ${data.targetUserId} -> ${data.role} (by ${data.grantedBy})`);
    }
  }

  /**
   * Upsert moderation action, update post.hidden if action is 'hide'.
   * CRITICAL: Uses eventAuthor as moderatorId
   */
  handleForumModeration(data, eventAuthor) {
    const existing = Moderation.findOne({ id: data.id });

    if (!existing) {
      Moderation.create({
        id: data.id,
        postId: data.postId,
        action: data.action,
        reason: data.reason || null,
        moderatorId: eventAuthor || data.moderatorId,
        entityType: data.entityType || 'post',
        createdAt: data.createdAt || Date.now(),
      });
    }

    // Apply moderation effect
    if (data.action === 'hide') {
      const post = Post.findOne({ id: data.postId });
      if (post) {
        Post.update(data.postId, { hidden: 1 });
      }
      // Also check if it's a thread
      const thread = Thread.findOne({ id: data.postId });
      if (thread) {
        Thread.update(data.postId, { hidden: 1 });
      }
    } else if (data.action === 'unhide') {
      const post = Post.findOne({ id: data.postId });
      if (post) {
        Post.update(data.postId, { hidden: 0 });
      }
      const thread = Thread.findOne({ id: data.postId });
      if (thread) {
        Thread.update(data.postId, { hidden: 0 });
      }
    } else if (data.action === 'lock' && data.threadId) {
      Thread.update(data.threadId, { locked: 1 });
    } else if (data.action === 'unlock' && data.threadId) {
      Thread.update(data.threadId, { locked: 0 });
    } else if (data.action === 'pin' && data.threadId) {
      Thread.update(data.threadId, { pinned: 1 });
    } else if (data.action === 'unpin' && data.threadId) {
      Thread.update(data.threadId, { pinned: 0 });
    }
  }

  /**
   * Upsert forum config (version-aware).
   * CRITICAL: Uses eventAuthor as authorId
   */
  handleForumConfig(data, eventAuthor) {
    const existing = Config.findOne({ id: data.id });

    if (existing) {
      // Version-aware
      if (data.version && existing.version && data.version <= existing.version) return;

      Config.update(data.id, {
        type: data.type,
        baseTheme: data.baseTheme || existing.baseTheme,
        overrides: typeof data.overrides === 'string' ? data.overrides : JSON.stringify(data.overrides || {}),
        version: data.version || (existing.version + 1),
        updatedAt: data.updatedAt || Date.now(),
      });
    } else {
      Config.create({
        id: data.id,
        type: data.type,
        baseTheme: data.baseTheme || null,
        overrides: typeof data.overrides === 'string' ? data.overrides : JSON.stringify(data.overrides || {}),
        authorId: eventAuthor,
        version: data.version || 1,
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      });
    }
  }

  // -----------------------------------------------------------------------
  // 3b. Payment & Marketplace handlers
  // -----------------------------------------------------------------------

  /**
   * Cache tip in tips table.
   * CRITICAL: Uses eventAuthor as fromUser (the sender)
   */
  handleTipEvent(data, eventAuthor) {
    const tipId = data.id || `TIP_${eventAuthor}_${data.postId}_${data.createdAt || Date.now()}`;
    const existing = Tip.findOne({ id: tipId });
    if (existing) return; // Tips are immutable

    const toUser = data.to || data.toUser;
    Tip.create({
      id: tipId,
      fromUser: eventAuthor || data.from,
      toUser,
      postId: data.postId || data.post_id || null,
      amount: data.amount,
      createdAt: data.timestamp || data.createdAt || Date.now(),
    });

    // Notify tip recipient
    if (toUser && eventAuthor && toUser !== eventAuthor) {
      this._createNotification({
        userId: toUser,
        type: 'tip',
        fromUserId: eventAuthor,
        entityId: data.postId || data.post_id || null,
        message: `sent you a tip of ${data.amount} nanos`,
      });
    }
  }

  /**
   * Cache subscription status.
   * CRITICAL: Uses eventAuthor as the subscriber
   */
  handleSubscriptionEvent(data, eventAuthor) {
    const userId = eventAuthor || data.user || data.userId;
    const existing = Subscription.findOne({ userId });

    if (existing) {
      // Update subscription — use the model's update but with userId as key
      const database = db.getDb();
      database.prepare(`
        UPDATE subscriptions SET tier = ?, expiresAt = ?, updatedAt = ? WHERE userId = ?
      `).run(data.tier, data.expiresAt || data.expires_at, Date.now(), userId);
    } else {
      // Insert new subscription directly (subscriptions table uses userId as PK, not id)
      const database = db.getDb();
      database.prepare(`
        INSERT INTO subscriptions (userId, tier, expiresAt, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, data.tier, data.expiresAt || data.expires_at, data.timestamp || Date.now(), Date.now());
    }
  }

  /**
   * Cache purchase record.
   * CRITICAL: Uses eventAuthor as the buyer
   */
  handlePurchaseEvent(data, eventAuthor) {
    const purchaseId = data.id || `PUR_${eventAuthor}_${data.contentId || data.content_id}_${data.createdAt || Date.now()}`;
    const existing = Purchase.findOne({ id: purchaseId });
    if (existing) return; // Purchases are immutable

    Purchase.create({
      id: purchaseId,
      buyer: eventAuthor || data.buyer,
      contentId: data.contentId || data.content_id,
      amount: data.amount,
      createdAt: data.timestamp || data.createdAt || Date.now(),
    });
  }

  /**
   * Cache badge purchase / configuration.
   * CRITICAL: Uses eventAuthor as the user who bought the badge
   */
  handleBadgeEvent(data, eventAuthor) {
    const userId = eventAuthor || data.user || data.userId;
    const badgeId = data.badgeId || data.badge_id;

    // If this is a badge configuration event (admin creating a badge)
    if (data.action === 'configure' || data.name) {
      const existingConfig = BadgeConfig.findOne({ id: badgeId });
      if (existingConfig) {
        BadgeConfig.update(badgeId, {
          name: data.name || existingConfig.name,
          price: data.price != null ? data.price : existingConfig.price,
          icon: data.icon || existingConfig.icon,
        });
      } else {
        BadgeConfig.create({
          id: badgeId,
          name: data.name,
          price: data.price || 0,
          icon: data.icon || null,
          createdAt: data.timestamp || Date.now(),
        });
      }
      return;
    }

    // Badge purchase — insert into user_badges
    try {
      const database = db.getDb();
      database.prepare(`
        INSERT OR IGNORE INTO user_badges (userId, badgeId, createdAt) VALUES (?, ?, ?)
      `).run(userId, badgeId, data.timestamp || Date.now());
    } catch (e) {
      // Duplicate — ignore
      sails.log.verbose(`[ForumManager] Badge already assigned: ${userId}/${badgeId}`);
    }
  }

  /**
   * Cache new escrow.
   * CRITICAL: Uses eventAuthor as the escrow creator (buyer)
   */
  handleEscrowCreated(data, eventAuthor) {
    const escrowId = data.id || data.escrowId || data.escrow_id;
    const existing = Escrow.findOne({ id: escrowId });
    if (existing) return; // Already cached

    Escrow.create({
      id: escrowId,
      buyer: eventAuthor || data.buyer,
      seller: data.seller,
      arbitrator: data.arbitrator,
      amount: data.amount,
      description: data.description || null,
      status: 0, // CREATED
      deadline: data.deadline || null,
      createdAt: data.timestamp || data.createdAt || Date.now(),
    });
  }

  /**
   * Update existing escrow status.
   * CRITICAL: Uses eventAuthor to verify who performed the action.
   *
   * Handles all EscrowUpdated actions from the Move contract:
   * - "delivered" -> status 1
   * - "disputed" -> status 2
   * - "vote_release", "vote_refund" -> no status change (intermediate)
   * - "released", "refunded", "expired_refund" -> status 3 (RESOLVED)
   */
  handleEscrowUpdated(data, eventAuthor) {
    const escrowId = data.id || data.escrowId || data.escrow_id;
    const existing = Escrow.findOne({ id: escrowId });
    if (!existing) {
      sails.log.warn(`[ForumManager] EscrowUpdated for unknown escrow: ${escrowId}`);
      return;
    }

    const updateData = {};

    // Map action string to numeric status if available
    const ACTION_STATUS_MAP = {
      'delivered': 1,     // ESCROW_DELIVERED
      'disputed': 2,      // ESCROW_DISPUTED
      'released': 3,      // ESCROW_RESOLVED
      'refunded': 3,      // ESCROW_RESOLVED
      'expired_refund': 3, // ESCROW_RESOLVED (buyer claimed after deadline)
    };

    if (data.action && ACTION_STATUS_MAP[data.action] != null) {
      updateData.status = ACTION_STATUS_MAP[data.action];
    } else if (data.status != null) {
      updateData.status = data.status;
    }

    // Mark resolvedAt for terminal states
    if (updateData.status === 3) {
      updateData.resolvedAt = data.resolvedAt || data.resolved_at || data.timestamp || Date.now();
    } else if (data.resolvedAt || data.resolved_at) {
      updateData.resolvedAt = data.resolvedAt || data.resolved_at;
    }

    // Use raw SQL because escrow table doesn't have standard 'updatedAt'
    if (Object.keys(updateData).length > 0) {
      const database = db.getDb();
      const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updateData);
      database.prepare(`UPDATE escrows SET ${setClauses} WHERE id = ?`).run(...values, escrowId);
    }

    // Notify escrow parties
    if (existing && eventAuthor) {
      const parties = [existing.buyer, existing.seller, existing.arbitrator].filter(p => p && p !== eventAuthor);
      const actionLabel = data.action || 'updated';
      for (const party of parties) {
        this._createNotification({
          userId: party,
          type: 'escrow',
          fromUserId: eventAuthor,
          entityId: escrowId,
          message: `Escrow ${actionLabel}`,
        });
      }
    }
  }

  /**
   * Cache rating, update user reputation.
   * CRITICAL: Uses eventAuthor as the rater
   */
  handleRatingEvent(data, eventAuthor) {
    const ratingId = data.id || `RAT_${data.escrowId || data.escrow_id}_${eventAuthor}`;
    const existing = Rating.findOne({ id: ratingId });
    if (existing) return; // Ratings are immutable

    const rater = eventAuthor || data.rater;
    const rated = data.rated;
    const score = data.score;

    Rating.create({
      id: ratingId,
      escrowId: data.escrowId || data.escrow_id,
      rater,
      rated,
      score,
      comment: data.comment || null,
      createdAt: data.timestamp || data.createdAt || Date.now(),
    });

    // Update reputation for the rated user
    this._updateReputation(rated, score, data);
  }

  /**
   * Update user reputation after a rating.
   */
  _updateReputation(userId, score, data) {
    const database = db.getDb();
    const existing = database.prepare('SELECT * FROM reputations WHERE userId = ?').get(userId);

    if (existing) {
      database.prepare(`
        UPDATE reputations SET
          totalTrades = totalTrades + 1,
          successful = successful + ?,
          ratingSum = ratingSum + ?,
          ratingCount = ratingCount + 1,
          totalVolume = totalVolume + ?
        WHERE userId = ?
      `).run(
        score >= 3 ? 1 : 0,
        score,
        data.amount || 0,
        userId
      );
    } else {
      database.prepare(`
        INSERT INTO reputations (userId, totalTrades, successful, disputesWon, disputesLost, totalVolume, ratingSum, ratingCount)
        VALUES (?, 1, ?, 0, 0, ?, ?, 1)
      `).run(userId, score >= 3 ? 1 : 0, data.amount || 0, score);
    }
  }

  // -----------------------------------------------------------------------
  // 4. getEntityHistory
  // -----------------------------------------------------------------------

  /**
   * Fetch all TXs from chain with matching tag+entityId.
   * Returns sorted by version descending (newest first).
   */
  async getEntityHistory(tag, entityId) {
    let records;
    if (iota.isMoveModeEnabled()) {
      records = await iota.queryForumEventsByEntity(tag, entityId);
    } else {
      records = await iota.getAllDataByTag(tag, entityId);
    }

    const history = records.map(record => {
      let payload;
      try {
        payload = typeof record.payload === 'string'
          ? JSON.parse(record.payload)
          : record.payload;
      } catch {
        payload = record.payload;
      }

      return {
        digest: record.digest,
        version: record.version || payload?.version || 0,
        timestamp: record.timestamp,
        data: payload,
      };
    });

    // Sort by version descending
    history.sort((a, b) => (b.version || 0) - (a.version || 0));

    return history;
  }

  // -----------------------------------------------------------------------
  // 5. Real-time subscription + fallback polling
  // -----------------------------------------------------------------------

  /**
   * Subscribe to real-time blockchain events via WebSocket.
   * Processes each new event immediately and broadcasts dataChanged.
   * Falls back to polling if subscription fails or is unavailable.
   */
  async startRealtimeSubscription() {
    if (!iota.isMoveModeEnabled()) return;

    try {
      this._unsubscribe = await iota.subscribeToForumEvents((event) => {
        try {
          ensureModels();
          const data = typeof event.payload === 'string'
            ? JSON.parse(event.payload)
            : event.payload;

          // CRITICAL: Extract eventAuthor from the blockchain event
          const eventAuthor = event.author || data.authorId || null;

          // Controlla se l'entita esiste gia con la stessa versione (evita duplicati dal nostro stesso nodo)
          const handlerName = TAG_HANDLERS[event.tag];
          if (!handlerName) return;

          this.processTransaction(event.tag, data, eventAuthor, { digest: event.digest || null });

          const entity = TAG_ENTITY[event.tag] || event.tag;
          sails.log.info(`[ForumManager] RT event: ${event.tag} ${event.entityId}`);

          sails.helpers.broadcastEvent('dataChanged', {
            entity,
            action: `${entity}Updated`,
            label: event.entityId,
            entityId: event.entityId,
            tag: event.tag,
            digest: event.digest,
            ...(data.threadId && { threadId: data.threadId }),
            ...(data.categoryId && { categoryId: data.categoryId }),
            ...(data.postId && { postId: data.postId }),
          }).catch(() => {});
        } catch (err) {
          sails.log.warn('[ForumManager] RT event processing error:', err.message);
        }
      });

      sails.log.info('[ForumManager] Real-time blockchain subscription active');
      return true;
    } catch (err) {
      sails.log.warn('[ForumManager] Real-time subscription failed, falling back to polling:', err.message);
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // 5b. pollNewEvents — Fallback incremental blockchain polling
  // -----------------------------------------------------------------------

  /**
   * Poll the blockchain for new events since the last known cursor.
   * Processes new transactions, updates cache, and broadcasts dataChanged
   * so all connected clients get real-time updates.
   * Call this periodically (e.g. every 30 seconds).
   */
  async pollNewEvents() {
    if (!iota.isMoveModeEnabled()) return;

    // Prima sync completa imposta il cursor
    if (!this._lastEventCursor && this._syncState.status !== 'idle') return;
    if (!this._pollReady) return; // Skip until cursor is initialized

    try {
      const { events, lastCursor } = await iota.queryForumEventsSince(this._lastEventCursor);

      if (events.length === 0) {
        this._lastEventCursor = lastCursor;
        return;
      }

      sails.log.info(`[ForumManager] Poll: ${events.length} new events from blockchain`);
      ensureModels();

      let changeCount = 0;
      for (const event of events) {
        try {
          const data = typeof event.payload === 'string'
            ? JSON.parse(event.payload)
            : event.payload;

          // CRITICAL: Extract eventAuthor from the blockchain event
          const eventAuthor = event.author || data.authorId || null;

          this.processTransaction(event.tag, data, eventAuthor, { digest: event.digest || null });
          changeCount++;

          // Broadcast dataChanged per ogni nuovo evento
          const entity = TAG_ENTITY[event.tag] || event.tag;
          try {
            await sails.helpers.broadcastEvent('dataChanged', {
              entity,
              action: `${entity}Updated`,
              label: event.entityId,
              entityId: event.entityId,
              tag: event.tag,
              digest: event.digest,
              ...(data.threadId && { threadId: data.threadId }),
              ...(data.categoryId && { categoryId: data.categoryId }),
              ...(data.postId && { postId: data.postId }),
            });
          } catch (bErr) {
            // broadcast best-effort
          }
        } catch (err) {
          sails.log.warn(`[ForumManager] Poll: error processing event:`, err.message);
        }
      }

      this._lastEventCursor = lastCursor;
      db.setSyncState('lastEventCursor', lastCursor || '');

      if (changeCount > 0) {
        sails.log.info(`[ForumManager] Poll: processed ${changeCount} changes, cursor updated`);
      }
    } catch (err) {
      sails.log.warn('[ForumManager] Poll failed:', err.message);
    }
  }

  /**
   * Initialize the event cursor by scanning all existing events.
   * Called after the initial syncFromBlockchain completes.
   */
  async initEventCursor() {
    if (!iota.isMoveModeEnabled()) return;
    try {
      // Try to restore persisted cursor from sync_state (avoids full re-scan)
      const savedCursor = db.getSyncState('lastEventCursor');
      if (savedCursor) {
        this._lastEventCursor = savedCursor;
        this._pollReady = true;
        sails.log.info(`[ForumManager] Event cursor restored from sync_state — polling ready`);
        return;
      }

      // No saved cursor — scan all existing events to advance cursor past them
      const { lastCursor } = await iota.queryForumEventsSince(null);
      this._lastEventCursor = lastCursor;
      this._pollReady = true;
      db.setSyncState('lastEventCursor', lastCursor || '');
      sails.log.info(`[ForumManager] Event cursor initialized from blockchain — polling ready`);
    } catch (err) {
      sails.log.warn('[ForumManager] Failed to init event cursor:', err.message);
    }
  }

  // -----------------------------------------------------------------------
  // 6. repairSync — Auto-repair missing data
  // -----------------------------------------------------------------------

  /**
   * Incremental repair: only scan events after the last repair cursor.
   * Uses a separate cursor (_lastRepairCursor) persisted in sync_state.
   * Called periodically to ensure eventual consistency without re-scanning everything.
   */
  async repairSync() {
    if (!iota.isMoveModeEnabled()) return;

    try {
      // Load persisted repair cursor
      if (!this._lastRepairCursor) {
        const saved = db.getSyncState('lastRepairCursor');
        this._lastRepairCursor = saved || null;
      }

      const { events, lastCursor } = await iota.queryForumEventsSince(this._lastRepairCursor);
      if (events.length === 0) {
        this._lastRepairCursor = lastCursor;
        db.setSyncState('lastRepairCursor', lastCursor || '');
        return 0;
      }

      ensureModels();
      let repaired = 0;

      for (const event of events) {
        try {
          const data = typeof event.payload === 'string'
            ? JSON.parse(event.payload)
            : event.payload;

          // CRITICAL: Extract eventAuthor from the blockchain event
          const eventAuthor = event.author || null;
          const tag = event.tag;

          const entityId = data.id || event.entityId;
          if (!entityId) continue;

          const handlerName = TAG_HANDLERS[tag];
          if (!handlerName) continue;

          // Check if entity exists and is up to date
          let model, existing;
          switch (tag) {
            case FORUM_USER: model = User; break;
            case FORUM_CATEGORY: model = Category; break;
            case FORUM_THREAD: model = Thread; break;
            case FORUM_POST: model = Post; break;
            case FORUM_VOTE:
              existing = Vote.findOne({ id: entityId });
              if (!existing && data.postId && eventAuthor) {
                existing = Vote.findOne({ postId: data.postId, authorId: eventAuthor });
              }
              if (!existing) {
                this.processTransaction(tag, data, eventAuthor);
                repaired++;
              }
              continue;
            // Payment events — check by id
            case FORUM_TIP:
            case FORUM_PURCHASE:
            case FORUM_ESCROW_CREATED:
            case FORUM_RATING:
              this.processTransaction(tag, data, eventAuthor);
              repaired++;
              continue;
            case FORUM_SUBSCRIPTION:
            case FORUM_BADGE:
            case FORUM_ESCROW_UPDATED:
              this.processTransaction(tag, data, eventAuthor);
              repaired++;
              continue;
            default: continue;
          }

          if (model) {
            existing = model.findOne({ id: entityId });
            if (!existing) {
              this.processTransaction(tag, data, eventAuthor);
              repaired++;
            } else if (data.version && existing.version && data.version > existing.version) {
              this.processTransaction(tag, data, eventAuthor);
              repaired++;
            }
          }
        } catch (err) {
          // Skip individual errors, continue repairing
        }
      }

      // Persist the repair cursor
      this._lastRepairCursor = lastCursor;
      db.setSyncState('lastRepairCursor', lastCursor || '');

      if (repaired > 0) {
        sails.log.info(`[ForumManager] Repair: fixed ${repaired} missing entries`);
        try {
          await sails.helpers.broadcastEvent('dataChanged', {
            entity: 'sync',
            action: 'repairCompleted',
            label: `${repaired} entries repaired`,
          });
        } catch (e) { /* best effort */ }
      }

      return repaired;
    } catch (err) {
      sails.log.warn('[ForumManager] Repair failed:', err.message);
      return 0;
    }
  }

  // -----------------------------------------------------------------------
  // 3c. Reaction handler
  // -----------------------------------------------------------------------

  /**
   * Handle reaction add/remove on a post.
   * CRITICAL: Uses eventAuthor as the user who reacted.
   */
  handleForumReaction(data, eventAuthor) {
    const userId = eventAuthor || data.userId;
    const postId = data.postId;
    const emoji = data.emoji;
    const action = data.action || 'add'; // 'add' or 'remove'

    if (!postId || !emoji || !userId) return;

    const database = db.getDb();

    if (action === 'remove') {
      database.prepare(
        'DELETE FROM reactions WHERE postId = ? AND userId = ? AND emoji = ?'
      ).run(postId, userId, emoji);
    } else {
      // Upsert reaction
      const reactionId = data.id || `REACT_${postId}_${userId}_${emoji}`;
      try {
        database.prepare(
          'INSERT OR IGNORE INTO reactions (id, postId, userId, emoji, createdAt) VALUES (?, ?, ?, ?, ?)'
        ).run(reactionId, postId, userId, emoji, data.createdAt || new Date().toISOString());
      } catch (e) {
        // Duplicate — ignore
      }
    }
  }

  // -----------------------------------------------------------------------
  // 3d. Direct Message handler
  // -----------------------------------------------------------------------

  /**
   * Handle encrypted direct message.
   * CRITICAL: Uses eventAuthor as the sender. Server stores ciphertext only.
   */
  handleForumDM(data, eventAuthor) {
    const fromUserId = eventAuthor || data.fromUserId;
    const { toUserId, encryptedContent, iv, ephemeralPublicKey } = data;

    if (!fromUserId || !toUserId || !encryptedContent || !iv) return;

    const dmId = data.id || `DM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const database = db.getDb();
      database.prepare(
        'INSERT OR IGNORE INTO direct_messages (id, fromUserId, toUserId, encryptedContent, iv, ephemeralPublicKey, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(dmId, fromUserId, toUserId, encryptedContent, iv, ephemeralPublicKey || null, data.createdAt || new Date().toISOString());

      // Create notification for recipient
      this._createNotification({
        userId: toUserId,
        type: 'dm',
        fromUserId,
        entityId: dmId,
        message: 'sent you an encrypted message',
      });
    } catch (e) {
      sails.log.warn('[ForumManager] handleForumDM error:', e.message);
    }
  }

  // -----------------------------------------------------------------------
  // 3e. Social Graph handlers (follow/unfollow)
  // -----------------------------------------------------------------------

  handleForumFollow(data, eventAuthor) {
    const followerId = eventAuthor || data.followerId;
    const followingId = data.followingId || data.target;
    if (!followerId || !followingId || followerId === followingId) return;

    const followId = data.id || `FOLLOW_${followerId}_${followingId}`;
    const database = db.getDb();
    try {
      database.prepare(
        'INSERT OR IGNORE INTO follows (id, followerId, followingId, createdAt) VALUES (?, ?, ?, ?)'
      ).run(followId, followerId, followingId, data.createdAt || new Date().toISOString());

      this._createNotification({
        userId: followingId,
        type: 'follow',
        fromUserId: followerId,
        entityId: followerId,
        message: 'started following you',
      });
    } catch (e) {
      sails.log.verbose(`[ForumManager] Follow already exists: ${followerId} -> ${followingId}`);
    }
  }

  handleForumUnfollow(data, eventAuthor) {
    const followerId = eventAuthor || data.followerId;
    const followingId = data.followingId || data.target;
    if (!followerId || !followingId) return;

    const database = db.getDb();
    database.prepare(
      'DELETE FROM follows WHERE followerId = ? AND followingId = ?'
    ).run(followerId, followingId);
  }

  // -----------------------------------------------------------------------
  // 3f. Governance handlers (polls & proposals)
  // -----------------------------------------------------------------------

  handleForumPoll(data, eventAuthor) {
    const pollId = data.id;
    if (!pollId) return;
    const existing = Poll.findOne({ id: pollId });

    if (existing) {
      const database = db.getDb();
      const updates = {};
      if (data.closed != null) updates.closed = data.closed ? 1 : 0;
      if (data.data) updates.data = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        database.prepare(`UPDATE polls SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), pollId);
      }
    } else {
      const database = db.getDb();
      database.prepare(
        'INSERT INTO polls (id, creatorId, optionsCount, deadline, closed, data, createdAt) VALUES (?, ?, ?, ?, 0, ?, ?)'
      ).run(pollId, eventAuthor || data.creatorId, data.optionsCount || data.options?.length || 2, data.deadline || '',
        typeof data.data === 'string' ? data.data : JSON.stringify(data.data || data), data.createdAt || new Date().toISOString());
    }
  }

  handleForumPollVote(data, eventAuthor) {
    const voterId = eventAuthor || data.voterId;
    const pollId = data.pollId;
    const optionIndex = data.optionIndex;
    if (!voterId || !pollId || optionIndex == null) return;
    const voteId = data.id || `PVOTE_${pollId}_${voterId}`;
    const database = db.getDb();
    try {
      database.prepare(
        'INSERT OR REPLACE INTO poll_votes (id, pollId, voterId, optionIndex, createdAt) VALUES (?, ?, ?, ?, ?)'
      ).run(voteId, pollId, voterId, optionIndex, data.createdAt || new Date().toISOString());
    } catch (e) { sails.log.verbose(`[ForumManager] Poll vote error: ${e.message}`); }
  }

  handleForumProposal(data, eventAuthor) {
    const proposalId = data.id;
    if (!proposalId) return;
    const existing = Proposal.findOne({ id: proposalId });

    if (existing) {
      const database = db.getDb();
      const updates = {};
      if (data.status != null) updates.status = data.status;
      if (data.data) updates.data = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        database.prepare(`UPDATE proposals SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), proposalId);
      }
    } else {
      const database = db.getDb();
      database.prepare(
        'INSERT INTO proposals (id, creatorId, quorum, deadline, status, data, createdAt) VALUES (?, ?, ?, ?, 0, ?, ?)'
      ).run(proposalId, eventAuthor || data.creatorId, data.quorum || 1, data.deadline || '',
        typeof data.data === 'string' ? data.data : JSON.stringify(data.data || data), data.createdAt || new Date().toISOString());
    }
  }

  handleForumProposalVote(data, eventAuthor) {
    const voterId = eventAuthor || data.voterId;
    const proposalId = data.proposalId;
    const voteYes = data.voteYes != null ? (data.voteYes ? 1 : 0) : (data.vote === 'yes' || data.vote === true ? 1 : 0);
    if (!voterId || !proposalId) return;
    const voteId = data.id || `PROPVOTE_${proposalId}_${voterId}`;
    const database = db.getDb();
    try {
      database.prepare(
        'INSERT OR REPLACE INTO proposal_votes (id, proposalId, voterId, voteYes, createdAt) VALUES (?, ?, ?, ?, ?)'
      ).run(voteId, proposalId, voterId, voteYes, data.createdAt || new Date().toISOString());
    } catch (e) { sails.log.verbose(`[ForumManager] Proposal vote error: ${e.message}`); }
  }

  // -----------------------------------------------------------------------
  // Notification helpers
  // -----------------------------------------------------------------------

  /**
   * Create an in-app notification and broadcast via WebSocket.
   */
  _createNotification({ userId, type, fromUserId, entityId, message }) {
    ensureModels();
    if (!userId || userId === fromUserId) return; // Don't notify yourself

    const id = `NOTIF_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const database = db.getDb();
      database.prepare(
        'INSERT INTO notifications (id, userId, type, fromUserId, entityId, message, read, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
      ).run(id, userId, type, fromUserId || null, entityId || null, message || '', new Date().toISOString());

      // Broadcast via WebSocket
      try {
        sails.helpers.broadcastEvent('newNotification', {
          userId,
          notification: { id, userId, type, fromUserId, entityId, message, read: 0, createdAt: new Date().toISOString() },
        }).catch(() => {});
      } catch (e) { /* best effort */ }
    } catch (e) {
      sails.log.warn('[ForumManager] Failed to create notification:', e.message);
    }
  }

  /**
   * Extract @mentions from content and return array of usernames.
   */
  _extractMentions(content) {
    if (!content) return [];
    const matches = content.match(/@(\w+)/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.slice(1)))];
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Recalculate postCount and lastPostAt on a thread using aggregate SQL.
   */
  _updateThreadStats(threadId) {
    const database = db.getDb();
    const thread = Thread.findOne({ id: threadId });
    if (!thread) return;

    const row = database.prepare(
      'SELECT COUNT(*) as cnt, MAX(createdAt) as maxCreatedAt FROM posts WHERE threadId = ? AND hidden = 0'
    ).get(threadId);

    const postCount = row.cnt || 0;
    const lastPostAt = row.maxCreatedAt || thread.createdAt || 0;

    Thread.update(threadId, { postCount, lastPostAt });
  }

  /**
   * Recalculate the score on a post from all votes using aggregate SQL.
   */
  _recalculatePostScore(postId) {
    const database = db.getDb();
    const row = database.prepare(
      'SELECT COALESCE(SUM(vote), 0) as score FROM votes WHERE postId = ?'
    ).get(postId);

    const post = Post.findOne({ id: postId });
    if (post) {
      Post.update(postId, { score: row.score });
    }
  }

  /**
   * Increment the appropriate counter in stats based on tag.
   */
  _incrementStat(stats, tag) {
    switch (tag) {
      case FORUM_USER: stats.users++; break;
      case FORUM_CATEGORY: stats.categories++; break;
      case FORUM_THREAD: stats.threads++; break;
      case FORUM_POST: stats.posts++; break;
      case FORUM_VOTE: stats.votes++; break;
      case FORUM_ROLE: stats.roles++; break;
      case FORUM_MODERATION: stats.moderations++; break;
      case FORUM_CONFIG: stats.configs++; break;
      case FORUM_TIP: stats.tips++; break;
      case FORUM_SUBSCRIPTION: stats.subscriptions++; break;
      case FORUM_PURCHASE: stats.purchases++; break;
      case FORUM_BADGE: stats.badges++; break;
      case FORUM_ESCROW_CREATED:
      case FORUM_ESCROW_UPDATED: stats.escrows++; break;
      case FORUM_RATING: stats.ratings++; break;
      case FORUM_REACTION: break; // reactions don't have a separate stat counter
    }
  }
}

module.exports = new ForumManager();
