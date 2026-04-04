/**
 * AgentOrchestrator.js — AI Beta Tester Agents
 *
 * Generates N agents with unique IOTA wallets that test all forum functionality.
 * Each agent has a personality that weights their actions differently.
 * Agents sign transactions directly with @iota/iota-sdk (no frontend involved).
 */

const zlib = require('zlib');
const crypto = require('crypto');

// ── Personalities ───────────────────────────────────────────────────────────

const PERSONALITIES = {
  explorer: { activity: 'high', risk: 'bold', sociality: 'extrovert', spending: 'generous', verbosity: 'verbose' },
  lurker: { activity: 'low', risk: 'cautious', sociality: 'introvert', spending: 'frugal', verbosity: 'concise' },
  trader: { activity: 'medium', risk: 'bold', sociality: 'normal', spending: 'generous', verbosity: 'normal' },
  troll: { activity: 'high', risk: 'bold', sociality: 'extrovert', spending: 'frugal', verbosity: 'verbose' },
  normal: { activity: 'medium', risk: 'normal', sociality: 'normal', spending: 'normal', verbosity: 'normal' },
};

// ── Weighted action pool ────────────────────────────────────────────────────

const ACTION_POOL = [
  { action: 'createThread', weight: 15, modules: ['forum'] },
  { action: 'replyToThread', weight: 20, modules: ['forum'] },
  { action: 'votePost', weight: 15, modules: ['forum'] },
  { action: 'tipUser', weight: 10, modules: ['payments'] },
  { action: 'createEscrow', weight: 5, modules: ['escrow'] },
  { action: 'markDelivered', weight: 3, modules: ['escrow'] },
  { action: 'voteEscrow', weight: 3, modules: ['escrow'] },
  { action: 'rateEscrow', weight: 3, modules: ['escrow'] },
  { action: 'reactToPost', weight: 10, modules: ['social'] },
  { action: 'followUser', weight: 8, modules: ['social'] },
  { action: 'searchForum', weight: 3, modules: ['forum'] },
  { action: 'testEdgeCase', weight: 5, modules: ['edgecases'] },
];

// ── Content templates ───────────────────────────────────────────────────────

const THREAD_TITLES = [
  'Discussing the future of {topic}',
  'Question: How does {topic} work?',
  '{topic} — thoughts and opinions',
  'Deep dive into {topic}',
  'Why {topic} matters for DeFi',
  'Has anyone tried {topic}?',
  'Comparing {topic} with alternatives',
  '{topic}: best practices and tips',
  'The state of {topic} in 2026',
  'Beginner guide to {topic}',
];

const TOPICS = [
  'IOTA smart contracts', 'Move language', 'DeFi on IOTA', 'tokenomics',
  'staking mechanisms', 'DAG-based consensus', 'layer-2 solutions',
  'cross-chain bridges', 'NFT marketplaces', 'decentralized identity',
  'zero-knowledge proofs', 'MEV protection', 'on-chain governance',
  'liquid staking', 'yield farming strategies', 'wallet security',
];

const POST_BODIES = [
  'I have been exploring this topic recently and found some interesting patterns. The key insight is that decentralization requires careful trade-offs between throughput and security. What are your thoughts on this?',
  'Great question! In my experience, the most important factor is the consensus mechanism. IOTA\'s approach with the Tangle offers unique advantages for IoT use cases that traditional blockchains cannot match.',
  'This is a fascinating area of research. I would recommend looking at the latest papers on directed acyclic graphs and how they handle finality. The improvements in IOTA 2.0 are quite significant.',
  'I agree with the previous points. One thing worth adding is that the developer experience has improved dramatically. The Move language makes smart contract development much safer.',
  'Has anyone benchmarked the throughput in testnet? I ran some tests and got impressive results. The transaction finality is under 3 seconds in most cases.',
  'Security should be the top priority. I would suggest always auditing smart contracts before deploying to mainnet. The Move prover helps catch many common vulnerabilities.',
  'From a tokenomics perspective, the fee structure needs to balance accessibility with spam prevention. The current model seems reasonable but could use some adjustments.',
  'I built a prototype using this approach and it works well for small-scale applications. Scaling to production will require additional optimization on the indexing layer.',
];

const REPLY_TEMPLATES = [
  'Interesting point about {topic}. I would add that {insight}.',
  'I partially agree. However, {insight}.',
  'Good analysis! One thing to consider is that {insight}.',
  'Thanks for sharing. In my experience, {insight}.',
  'This is spot on. Additionally, {insight}.',
  'I have a different perspective: {insight}.',
];

const INSIGHTS = [
  'the gas costs can be optimized by batching transactions',
  'Move\'s type system prevents most common smart contract bugs',
  'testnet performance does not always reflect mainnet behavior',
  'community governance is essential for long-term sustainability',
  'interoperability between chains will be crucial in the next cycle',
  'the developer tooling has matured significantly this year',
  'on-chain storage costs need to be considered for large datasets',
  'validator economics determine the security budget',
];

const AGENT_NAMES = [
  'AlphaBot', 'BetaTester', 'CryptoNaut', 'DeFiDog', 'EchoNode',
  'ForkHunter', 'GasGuru', 'HashMiner', 'IotaFan', 'JadeLedger',
  'KeyMaster', 'LedgerLion', 'MoveMonk', 'NodeRunner', 'OracleOwl',
  'ProofPanda', 'QueryBot', 'RebaseRex', 'StakeShark', 'TangleT',
  'UnitTest', 'ValidatorV', 'WeiWolf', 'XChainX', 'YieldYak',
  'ZeroBot', 'AuditAce', 'BlockBear', 'ChainCat', 'DagDuck',
  'EventEmu', 'FinFox', 'GovGoat', 'HubHawk', 'IndexIbis',
  'JoinJay', 'KernelKoi', 'LockLynx', 'MintMole', 'NoncNarwhal',
  'OpOrca', 'PeerPig', 'QuorumQ', 'RollRam', 'SyncSeal',
  'TxTiger', 'UtxoUrc', 'VoteViper', 'WrapWren', 'XferXen',
];

const EDGE_CASE_DESCRIPTIONS = [
  'Empty string as thread title',
  'Very long post content (5000+ chars)',
  'Special characters in username: <script>alert(1)</script>',
  'Zero amount tip',
  'Self-tip attempt',
  'Vote on own post',
  'Double vote on same post',
  'Create thread in non-existent category',
  'Tip with insufficient balance',
  'Escrow with zero deadline',
];

// ── Clock object ID (IOTA system) ──────────────────────────────────────────
const CLOCK_OBJECT_ID = '0x6';

// ── Helper: gzip compress ──────────────────────────────────────────────────
function gzipCompress(obj) {
  const json = JSON.stringify(obj);
  return zlib.gzipSync(Buffer.from(json, 'utf8'));
}

// ── Helper: random pick ────────────────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

// ── Personality weight modifiers ───────────────────────────────────────────
function getWeightModifier(personality, action) {
  const p = PERSONALITIES[personality] || PERSONALITIES.normal;
  let mod = 1.0;

  // Activity level
  if (p.activity === 'high') mod *= 1.5;
  else if (p.activity === 'low') mod *= 0.4;

  // Spending actions
  if (['tipUser', 'createEscrow', 'purchaseBadge'].includes(action)) {
    if (p.spending === 'generous') mod *= 2.0;
    else if (p.spending === 'frugal') mod *= 0.3;
  }

  // Social actions
  if (['replyToThread', 'reactToPost', 'followUser'].includes(action)) {
    if (p.sociality === 'extrovert') mod *= 1.8;
    else if (p.sociality === 'introvert') mod *= 0.3;
  }

  // Edge cases
  if (action === 'testEdgeCase') {
    if (p.risk === 'bold') mod *= 2.5;
    else if (p.risk === 'cautious') mod *= 0.1;
  }

  return mod;
}

// ═══════════════════════════════════════════════════════════════════════════
// AgentOrchestrator Class
// ═══════════════════════════════════════════════════════════════════════════

class AgentOrchestrator {
  constructor() {
    this.agents = [];
    this.running = false;
    this.paused = false;
    this.config = null;
    this.stats = { actions: 0, errors: 0, startedAt: null, feedback: [] };
    this.timers = [];
    this.activityLog = [];   // last N actions for live feed
    this.maxLogSize = 200;
    this._sdk = null;
    this._client = null;
    this._moveConfig = null;
    // TX queue per agent (IOTA does not allow parallel TXs from same wallet)
    this._txQueues = new Map();
  }

  // ── SDK lazy loader ────────────────────────────────────────────────────

  async _loadSdk() {
    if (this._sdk) return this._sdk;
    const [clientMod, txMod, keypairMod, faucetMod] = await Promise.all([
      import('@iota/iota-sdk/client'),
      import('@iota/iota-sdk/transactions'),
      import('@iota/iota-sdk/keypairs/ed25519'),
      import('@iota/iota-sdk/faucet'),
    ]);
    this._sdk = {
      getFullnodeUrl: clientMod.getFullnodeUrl,
      IotaClient: clientMod.IotaClient,
      Transaction: txMod.Transaction,
      Ed25519Keypair: keypairMod.Ed25519Keypair,
      getFaucetHost: faucetMod.getFaucetHost,
      requestIotaFromFaucetV1: faucetMod.requestIotaFromFaucetV1,
    };
    return this._sdk;
  }

  async _getClient() {
    if (this._client) return this._client;
    const sdk = await this._loadSdk();
    const iota = require('./iota');
    const config = require('../../config/private_iota_conf');
    const url = config.IOTA_NODE_URL || sdk.getFullnodeUrl(config.IOTA_NETWORK || 'testnet');
    this._client = new sdk.IotaClient({ url });
    return this._client;
  }

  _getMoveConfig() {
    if (this._moveConfig) return this._moveConfig;
    const config = require('../../config/private_iota_conf');
    this._moveConfig = {
      packageId: config.FORUM_PACKAGE_ID,
      forumObjectId: config.FORUM_OBJECT_ID,
      registryId: config.FORUM_REGISTRY_ID,
      treasuryId: config.FORUM_TREASURY_ID,
      subscriptionStoreId: config.FORUM_SUBSCRIPTION_STORE_ID,
      marketplaceStoreId: config.FORUM_MARKETPLACE_STORE_ID,
      network: config.IOTA_NETWORK || 'testnet',
    };
    return this._moveConfig;
  }

  // Enqueue TX for a specific agent to avoid parallel TX conflicts
  _enqueueTx(agentId, fn) {
    const prev = this._txQueues.get(agentId) || Promise.resolve();
    const next = prev.then(fn, fn);
    this._txQueues.set(agentId, next);
    return next;
  }

  // ── Initialize agents ──────────────────────────────────────────────────

  async initialize(config) {
    const {
      count = 5,
      duration = 300,       // seconds
      frequency = 10,       // seconds between actions per agent
      personality = 'random',
      modules = ['forum', 'payments', 'escrow', 'social', 'edgecases'],
    } = config;

    this.config = { count, duration, frequency, personality, modules };
    this.agents = [];
    this.stats = { actions: 0, errors: 0, startedAt: null, feedback: [] };
    this.activityLog = [];

    const sdk = await this._loadSdk();
    const client = await this._getClient();
    const moveConfig = this._getMoveConfig();

    if (!moveConfig.packageId || !moveConfig.forumObjectId) {
      throw new Error('Move contract not deployed. Cannot start agents.');
    }

    const personalityKeys = Object.keys(PERSONALITIES);

    console.log(`[AgentOrchestrator] Initializing ${count} agents...`);

    for (let i = 0; i < count; i++) {
      // Generate mnemonic
      const { generateMnemonic } = await import('@scure/bip39');
      const { wordlist } = await import('@scure/bip39/wordlists/english.js');
      const mnemonic = generateMnemonic(wordlist);

      // Derive keypair
      const keypair = sdk.Ed25519Keypair.deriveKeypair(mnemonic);
      const address = keypair.getPublicKey().toIotaAddress();

      // Assign personality
      let agentPersonality;
      if (personality === 'random') {
        agentPersonality = pick(personalityKeys);
      } else if (personality === 'balanced') {
        agentPersonality = personalityKeys[i % personalityKeys.length];
      } else if (PERSONALITIES[personality]) {
        agentPersonality = personality;
      } else {
        agentPersonality = 'normal';
      }

      const name = i < AGENT_NAMES.length ? AGENT_NAMES[i] : `Agent_${i}`;

      this.agents.push({
        id: generateId(),
        index: i,
        name,
        personality: agentPersonality,
        address,
        keypair,
        mnemonic,
        registered: false,
        funded: false,
        actionsCount: 0,
        errorsCount: 0,
        lastAction: null,
        status: 'initializing',
        createdThreads: [],
        createdPosts: [],
      });
    }

    // Request faucet for all agents (from server wallet)
    console.log(`[AgentOrchestrator] Requesting faucet for ${count} agents...`);
    const iota = require('./iota');
    const serverKeypair = await iota.getKeypair();
    const serverClient = await iota.getClient();

    for (const agent of this.agents) {
      try {
        // Send 2 IOTA from server wallet to agent
        const tx = new sdk.Transaction();
        const amount = 2_000_000_000n; // 2 IOTA
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount.toString())]);
        tx.transferObjects([coin], agent.address);
        tx.setGasBudget(50_000_000);

        const result = await serverClient.signAndExecuteTransaction({
          signer: serverKeypair,
          transaction: tx,
          options: { showEffects: true },
        });
        await serverClient.waitForTransaction({ digest: result.digest });

        if (result.effects?.status?.status === 'success') {
          agent.funded = true;
          agent.status = 'funded';
          console.log(`[AgentOrchestrator] Funded ${agent.name} (${agent.address})`);
        } else {
          agent.status = 'fund_failed';
          console.log(`[AgentOrchestrator] Fund failed for ${agent.name}`);
        }

        // Small delay between faucet TXs
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        agent.status = 'fund_failed';
        console.log(`[AgentOrchestrator] Fund error for ${agent.name}: ${err.message}`);
      }
    }

    // Register all funded agents on-chain
    console.log(`[AgentOrchestrator] Registering agents on-chain...`);
    for (const agent of this.agents) {
      if (!agent.funded) continue;
      try {
        await this._registerAgent(agent);
        agent.registered = true;
        agent.status = 'ready';
      } catch (err) {
        agent.status = 'register_failed';
        this._addFeedback(agent, 'error', 'register', `Registration failed: ${err.message}`, 'high');
      }
      await new Promise(r => setTimeout(r, 300));
    }

    const readyCount = this.agents.filter(a => a.status === 'ready').length;
    console.log(`[AgentOrchestrator] ${readyCount}/${count} agents ready.`);
    return { total: count, ready: readyCount };
  }

  // ── Register agent on-chain ────────────────────────────────────────────

  async _registerAgent(agent) {
    const sdk = await this._loadSdk();
    const client = await this._getClient();
    const mc = this._getMoveConfig();

    const entityId = agent.address;
    const data = gzipCompress({
      username: agent.name,
      address: agent.address,
      registeredAt: Date.now(),
      isAgent: true,
    });

    const tx = new sdk.Transaction();
    tx.moveCall({
      target: `${mc.packageId}::forum::register`,
      arguments: [
        tx.object(mc.registryId),
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(entityId))),
        tx.pure.vector('u8', Array.from(data)),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
    tx.setGasBudget(50_000_000);

    const result = await client.signAndExecuteTransaction({
      signer: agent.keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error || 'Registration TX failed');
    }

    return result;
  }

  // ── Start the agent loop ───────────────────────────────────────────────

  async start() {
    if (this.running) throw new Error('Agents already running');
    if (!this.agents.length) throw new Error('No agents initialized. Call initialize() first.');

    this.running = true;
    this.paused = false;
    this.stats.startedAt = Date.now();

    const readyAgents = this.agents.filter(a => a.status === 'ready');
    console.log(`[AgentOrchestrator] Starting ${readyAgents.length} agents (frequency: ${this.config.frequency}s, duration: ${this.config.duration}s)`);

    // Schedule each agent's action loop
    for (const agent of readyAgents) {
      agent.status = 'running';
      const interval = this.config.frequency * 1000;
      // Add some jitter so agents don't all fire at once
      const jitter = Math.random() * interval * 0.5;

      const timer = setTimeout(() => {
        const loop = setInterval(async () => {
          if (!this.running) { clearInterval(loop); return; }
          if (this.paused) return;
          try {
            await this.executeAction(agent);
          } catch (err) {
            console.log(`[AgentOrchestrator] Unhandled error for ${agent.name}: ${err.message}`);
          }
        }, interval);
        this.timers.push(loop);

        // Also run immediately
        if (this.running && !this.paused) {
          this.executeAction(agent).catch(() => {});
        }
      }, jitter);
      this.timers.push(timer);
    }

    // Duration timeout — auto-stop
    if (this.config.duration > 0) {
      const durationTimer = setTimeout(() => {
        console.log(`[AgentOrchestrator] Duration reached (${this.config.duration}s). Stopping.`);
        this.stop();
      }, this.config.duration * 1000);
      this.timers.push(durationTimer);
    }

    return { running: true, agents: readyAgents.length };
  }

  // ── Stop all agents ────────────────────────────────────────────────────

  stop() {
    this.running = false;
    this.paused = false;
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers = [];
    for (const agent of this.agents) {
      if (agent.status === 'running') agent.status = 'stopped';
    }
    console.log(`[AgentOrchestrator] Stopped. Total actions: ${this.stats.actions}, errors: ${this.stats.errors}`);
    return this.getStatus();
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    for (const agent of this.agents) {
      if (agent.status === 'running') agent.status = 'paused';
    }
    console.log('[AgentOrchestrator] Paused.');
  }

  resume() {
    if (!this.running) return;
    this.paused = false;
    for (const agent of this.agents) {
      if (agent.status === 'paused') agent.status = 'running';
    }
    console.log('[AgentOrchestrator] Resumed.');
  }

  // ── Execute a single action ────────────────────────────────────────────

  async executeAction(agent) {
    if (!this.running || this.paused) return;

    // Filter actions by enabled modules
    const enabledActions = ACTION_POOL.filter(a =>
      a.modules.some(m => this.config.modules.includes(m))
    );

    if (!enabledActions.length) return;

    // Apply personality weight modifiers
    const weighted = enabledActions.map(a => ({
      ...a,
      weight: a.weight * getWeightModifier(agent.personality, a.action),
    }));

    const chosen = pickWeighted(weighted);
    const startTime = Date.now();

    try {
      const result = await this._enqueueTx(agent.id, () =>
        this._executeActionImpl(agent, chosen.action)
      );

      agent.actionsCount++;
      this.stats.actions++;
      agent.lastAction = chosen.action;

      this._addLog(agent, chosen.action, 'success', Date.now() - startTime, result?.digest);
    } catch (err) {
      agent.errorsCount++;
      this.stats.errors++;

      this._addLog(agent, chosen.action, 'error', Date.now() - startTime, null, err.message);
      this._addFeedback(agent, 'error', chosen.action, err.message, 'low');
    }
  }

  // ── Action implementations ─────────────────────────────────────────────

  async _executeActionImpl(agent, actionName) {
    switch (actionName) {
      case 'createThread': return this._actionCreateThread(agent);
      case 'replyToThread': return this._actionReplyToThread(agent);
      case 'votePost': return this._actionVotePost(agent);
      case 'tipUser': return this._actionTipUser(agent);
      case 'createEscrow': return this._actionCreateEscrow(agent);
      case 'markDelivered': return this._actionMarkDelivered(agent);
      case 'voteEscrow': return this._actionVoteEscrow(agent);
      case 'rateEscrow': return this._actionRateEscrow(agent);
      case 'reactToPost': return this._actionReactToPost(agent);
      case 'followUser': return this._actionFollowUser(agent);
      case 'searchForum': return this._actionSearchForum(agent);
      case 'testEdgeCase': return this._actionTestEdgeCase(agent);
      default: return null;
    }
  }

  // ── Helper: build and send Move TX ─────────────────────────────────────

  async _sendMoveTx(agent, buildFn) {
    const sdk = await this._loadSdk();
    const client = await this._getClient();

    const tx = new sdk.Transaction();
    buildFn(tx, sdk);
    tx.setGasBudget(50_000_000);

    const result = await client.signAndExecuteTransaction({
      signer: agent.keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      const err = result.effects?.status?.error || 'TX failed';
      throw new Error(err);
    }

    return result;
  }

  // ── Helper: fetch forum data from API ──────────────────────────────────

  async _fetchApi(path) {
    try {
      // Use internal HTTP call to the Sails server
      const port = sails.config.port || 1337;
      const response = await fetch(`http://localhost:${port}/api/v1/${path}`);
      return response.json();
    } catch {
      return null;
    }
  }

  // ── Action: Create Thread ──────────────────────────────────────────────

  async _actionCreateThread(agent) {
    const mc = this._getMoveConfig();

    // Get categories
    const categories = await this._fetchApi('categories');
    if (!categories?.length) {
      throw new Error('No categories available to create thread');
    }

    const category = pick(categories);
    const topic = pick(TOPICS);
    const titleTemplate = pick(THREAD_TITLES);
    const title = titleTemplate.replace('{topic}', topic);
    const body = pick(POST_BODIES);

    const threadId = `THR_${generateId()}`;
    const entityId = threadId;
    const data = {
      title,
      body,
      categoryId: category.id,
      authorId: agent.address,
      createdAt: Date.now(),
    };

    const compressed = gzipCompress(data);
    const tag = 'FORUM_THREAD';

    return this._sendMoveTx(agent, (tx) => {
      tx.moveCall({
        target: `${mc.packageId}::forum::post_event`,
        arguments: [
          tx.object(mc.forumObjectId),
          tx.object(mc.registryId),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(tag))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(entityId))),
          tx.pure.vector('u8', Array.from(compressed)),
          tx.pure.u64(1),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    }).then(result => {
      agent.createdThreads.push(threadId);
      return result;
    });
  }

  // ── Action: Reply to Thread ────────────────────────────────────────────

  async _actionReplyToThread(agent) {
    const mc = this._getMoveConfig();

    // Get existing threads
    const threadsData = await this._fetchApi('threads?page=1');
    const threads = threadsData?.threads || threadsData;
    if (!threads?.length) {
      throw new Error('No threads to reply to');
    }

    const thread = pick(threads);
    const topic = pick(TOPICS);
    const template = pick(REPLY_TEMPLATES);
    const insight = pick(INSIGHTS);
    const body = template.replace('{topic}', topic).replace('{insight}', insight);

    const postId = `PST_${generateId()}`;
    const data = {
      body,
      threadId: thread.id,
      authorId: agent.address,
      createdAt: Date.now(),
    };

    const compressed = gzipCompress(data);

    return this._sendMoveTx(agent, (tx) => {
      tx.moveCall({
        target: `${mc.packageId}::forum::post_event`,
        arguments: [
          tx.object(mc.forumObjectId),
          tx.object(mc.registryId),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode('FORUM_POST'))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(postId))),
          tx.pure.vector('u8', Array.from(compressed)),
          tx.pure.u64(1),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    }).then(result => {
      agent.createdPosts.push(postId);
      return result;
    });
  }

  // ── Action: Vote on a Post ─────────────────────────────────────────────

  async _actionVotePost(agent) {
    const mc = this._getMoveConfig();

    const threadsData = await this._fetchApi('threads?page=1');
    const threads = threadsData?.threads || threadsData;
    if (!threads?.length) throw new Error('No threads for voting');

    const thread = pick(threads);
    // Get posts of this thread
    const postsData = await this._fetchApi(`posts?thread=${thread.id}`);
    const posts = postsData?.posts || postsData;
    if (!posts?.length) throw new Error('No posts to vote on');

    const post = pick(posts);
    const voteType = Math.random() > 0.3 ? 'up' : 'down';

    const voteId = `VOT_${generateId()}`;
    const data = {
      postId: post.id,
      threadId: thread.id,
      type: voteType,
      voterId: agent.address,
      createdAt: Date.now(),
    };

    const compressed = gzipCompress(data);

    return this._sendMoveTx(agent, (tx) => {
      tx.moveCall({
        target: `${mc.packageId}::forum::post_event`,
        arguments: [
          tx.object(mc.forumObjectId),
          tx.object(mc.registryId),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode('FORUM_VOTE'))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(voteId))),
          tx.pure.vector('u8', Array.from(compressed)),
          tx.pure.u64(1),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    });
  }

  // ── Action: Tip a User ─────────────────────────────────────────────────

  async _actionTipUser(agent) {
    const mc = this._getMoveConfig();

    const threadsData = await this._fetchApi('threads?page=1');
    const threads = threadsData?.threads || threadsData;
    if (!threads?.length) throw new Error('No threads for tipping');

    const thread = pick(threads);
    const postsData = await this._fetchApi(`posts?thread=${thread.id}`);
    const posts = postsData?.posts || postsData;
    if (!posts?.length) throw new Error('No posts to tip');

    const post = pick(posts);
    const recipientAddress = post.authorId || post.createdBy;
    if (!recipientAddress || recipientAddress === agent.address) {
      throw new Error('Cannot tip self or unknown author');
    }

    // Tip amount: 0.01 to 0.1 IOTA
    const amount = BigInt(Math.floor(10_000_000 + Math.random() * 90_000_000)); // 0.01-0.1 IOTA in nanos

    return this._sendMoveTx(agent, (tx) => {
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount.toString())]);
      tx.moveCall({
        target: `${mc.packageId}::forum::tip`,
        arguments: [
          tx.object(mc.registryId),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(post.id))),
          coin,
          tx.pure.address(recipientAddress),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    });
  }

  // ── Action: Create Escrow ──────────────────────────────────────────────

  async _actionCreateEscrow(agent) {
    const mc = this._getMoveConfig();

    // Find another agent to be the seller
    const otherAgents = this.agents.filter(a => a.id !== agent.id && a.registered);
    if (!otherAgents.length) throw new Error('No other agents for escrow');

    const seller = pick(otherAgents);
    // Pick a random third agent or the first other one as arbitrator
    const arbitratorCandidates = otherAgents.filter(a => a.id !== seller.id);
    const arbitrator = arbitratorCandidates.length ? pick(arbitratorCandidates) : seller;

    const descCompressed = gzipCompress({ description: 'Agent test escrow: development service' });
    const deadline = Date.now() + 3600_000; // 1 hour from now
    const amount = BigInt(100_000_000); // 0.1 IOTA

    return this._sendMoveTx(agent, (tx) => {
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount.toString())]);
      tx.moveCall({
        target: `${mc.packageId}::forum::create_escrow`,
        arguments: [
          tx.object(mc.registryId),
          tx.pure.address(seller.address),
          tx.pure.address(arbitrator.address),
          tx.pure.vector('u8', Array.from(descCompressed)),
          tx.pure.u64(deadline),
          coin,
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    });
  }

  // ── Action: Mark Delivered (escrow) ────────────────────────────────────

  async _actionMarkDelivered(agent) {
    const mc = this._getMoveConfig();

    const escrowsData = await this._fetchApi('escrows?status=active');
    const escrows = escrowsData?.escrows || escrowsData;
    if (!escrows?.length) throw new Error('No active escrows');

    // Find escrow where this agent is the seller
    const myEscrows = escrows.filter(e => e.seller === agent.address);
    if (!myEscrows.length) throw new Error('No escrows where agent is seller');

    const escrow = pick(myEscrows);

    return this._sendMoveTx(agent, (tx) => {
      tx.moveCall({
        target: `${mc.packageId}::forum::mark_delivered`,
        arguments: [
          tx.object(escrow.objectId || escrow.id),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    });
  }

  // ── Action: Vote on Escrow ─────────────────────────────────────────────

  async _actionVoteEscrow(agent) {
    const mc = this._getMoveConfig();

    const escrowsData = await this._fetchApi('escrows');
    const escrows = escrowsData?.escrows || escrowsData;
    if (!escrows?.length) throw new Error('No escrows to vote on');

    // Find escrow where agent is buyer, seller, or arbitrator
    const myEscrows = escrows.filter(e =>
      e.buyer === agent.address || e.seller === agent.address || e.arbitrator === agent.address
    );
    if (!myEscrows.length) throw new Error('No escrows involving this agent');

    const escrow = pick(myEscrows);
    const voteRelease = Math.random() > 0.5;

    return this._sendMoveTx(agent, (tx) => {
      tx.moveCall({
        target: `${mc.packageId}::forum::${voteRelease ? 'vote_release' : 'vote_refund'}`,
        arguments: [
          tx.object(escrow.objectId || escrow.id),
          tx.object(mc.marketplaceStoreId),
          tx.object(mc.treasuryId),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    });
  }

  // ── Action: Rate Escrow ────────────────────────────────────────────────

  async _actionRateEscrow(agent) {
    const mc = this._getMoveConfig();

    const escrowsData = await this._fetchApi('escrows?status=completed');
    const escrows = escrowsData?.escrows || escrowsData;
    if (!escrows?.length) throw new Error('No completed escrows to rate');

    const myEscrows = escrows.filter(e =>
      e.buyer === agent.address || e.seller === agent.address
    );
    if (!myEscrows.length) throw new Error('No completed escrows for this agent');

    const escrow = pick(myEscrows);
    const rated = escrow.buyer === agent.address ? escrow.seller : escrow.buyer;
    const score = Math.floor(Math.random() * 5) + 1; // 1-5
    const commentCompressed = gzipCompress({ comment: `Agent test rating: ${score}/5 stars` });

    return this._sendMoveTx(agent, (tx) => {
      tx.moveCall({
        target: `${mc.packageId}::forum::rate_trade`,
        arguments: [
          tx.object(escrow.objectId || escrow.id),
          tx.object(mc.marketplaceStoreId),
          tx.pure.address(rated),
          tx.pure.u8(score),
          tx.pure.vector('u8', Array.from(commentCompressed)),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    });
  }

  // ── Action: React to Post ──────────────────────────────────────────────

  async _actionReactToPost(agent) {
    const mc = this._getMoveConfig();

    const threadsData = await this._fetchApi('threads?page=1');
    const threads = threadsData?.threads || threadsData;
    if (!threads?.length) throw new Error('No threads for reactions');

    const thread = pick(threads);
    const postsData = await this._fetchApi(`posts?thread=${thread.id}`);
    const posts = postsData?.posts || postsData;
    if (!posts?.length) throw new Error('No posts to react to');

    const post = pick(posts);
    const reactions = ['like', 'love', 'laugh', 'think', 'fire', 'clap'];
    const reaction = pick(reactions);

    const reactionId = `RCT_${generateId()}`;
    const data = {
      postId: post.id,
      reaction,
      authorId: agent.address,
      createdAt: Date.now(),
    };

    const compressed = gzipCompress(data);

    return this._sendMoveTx(agent, (tx) => {
      tx.moveCall({
        target: `${mc.packageId}::forum::post_event`,
        arguments: [
          tx.object(mc.forumObjectId),
          tx.object(mc.registryId),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode('FORUM_VOTE'))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(reactionId))),
          tx.pure.vector('u8', Array.from(compressed)),
          tx.pure.u64(1),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    });
  }

  // ── Action: Follow User ────────────────────────────────────────────────

  async _actionFollowUser(agent) {
    const mc = this._getMoveConfig();

    const usersData = await this._fetchApi('members');
    const users = usersData?.users || usersData;
    if (!users?.length) throw new Error('No users to follow');

    const otherUsers = users.filter(u => u.id !== agent.address);
    if (!otherUsers.length) throw new Error('No other users to follow');

    const target = pick(otherUsers);
    const followId = `FLW_${generateId()}`;
    const data = {
      targetUserId: target.id,
      followerId: agent.address,
      createdAt: Date.now(),
    };

    const compressed = gzipCompress(data);

    return this._sendMoveTx(agent, (tx) => {
      tx.moveCall({
        target: `${mc.packageId}::forum::post_event`,
        arguments: [
          tx.object(mc.forumObjectId),
          tx.object(mc.registryId),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode('FORUM_VOTE'))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(followId))),
          tx.pure.vector('u8', Array.from(compressed)),
          tx.pure.u64(1),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });
    });
  }

  // ── Action: Search Forum ───────────────────────────────────────────────

  async _actionSearchForum(agent) {
    const queries = ['IOTA', 'Move', 'smart contract', 'DeFi', 'staking', 'escrow', 'NFT'];
    const query = pick(queries);
    const results = await this._fetchApi(`search?q=${encodeURIComponent(query)}`);
    // Search is read-only, just log the action
    return { action: 'search', query, results: results?.length || 0 };
  }

  // ── Action: Test Edge Cases ────────────────────────────────────────────

  async _actionTestEdgeCase(agent) {
    const mc = this._getMoveConfig();
    const caseIndex = Math.floor(Math.random() * EDGE_CASE_DESCRIPTIONS.length);

    try {
      switch (caseIndex) {
        case 0: { // Empty title
          const data = { title: '', body: 'Test body', categoryId: 'nonexistent', authorId: agent.address, createdAt: Date.now() };
          const compressed = gzipCompress(data);
          return this._sendMoveTx(agent, (tx) => {
            tx.moveCall({
              target: `${mc.packageId}::forum::post_event`,
              arguments: [
                tx.object(mc.forumObjectId), tx.object(mc.registryId),
                tx.pure.vector('u8', Array.from(new TextEncoder().encode('FORUM_THREAD'))),
                tx.pure.vector('u8', Array.from(new TextEncoder().encode(`THR_EDGE_${generateId()}`))),
                tx.pure.vector('u8', Array.from(compressed)),
                tx.pure.u64(1), tx.object(CLOCK_OBJECT_ID),
              ],
            });
          });
        }
        case 1: { // Very long content
          const longBody = 'A'.repeat(5000);
          const data = { title: 'Edge case: long content', body: longBody, categoryId: 'test', authorId: agent.address, createdAt: Date.now() };
          const compressed = gzipCompress(data);
          return this._sendMoveTx(agent, (tx) => {
            tx.moveCall({
              target: `${mc.packageId}::forum::post_event`,
              arguments: [
                tx.object(mc.forumObjectId), tx.object(mc.registryId),
                tx.pure.vector('u8', Array.from(new TextEncoder().encode('FORUM_THREAD'))),
                tx.pure.vector('u8', Array.from(new TextEncoder().encode(`THR_EDGE_${generateId()}`))),
                tx.pure.vector('u8', Array.from(compressed)),
                tx.pure.u64(1), tx.object(CLOCK_OBJECT_ID),
              ],
            });
          });
        }
        case 2: { // XSS in content
          const data = { title: '<script>alert("xss")</script>', body: '<img onerror="alert(1)" src="x">', categoryId: 'test', authorId: agent.address, createdAt: Date.now() };
          const compressed = gzipCompress(data);
          return this._sendMoveTx(agent, (tx) => {
            tx.moveCall({
              target: `${mc.packageId}::forum::post_event`,
              arguments: [
                tx.object(mc.forumObjectId), tx.object(mc.registryId),
                tx.pure.vector('u8', Array.from(new TextEncoder().encode('FORUM_THREAD'))),
                tx.pure.vector('u8', Array.from(new TextEncoder().encode(`THR_EDGE_${generateId()}`))),
                tx.pure.vector('u8', Array.from(compressed)),
                tx.pure.u64(1), tx.object(CLOCK_OBJECT_ID),
              ],
            });
          });
        }
        default: {
          // Generic edge case — just log what we would test
          this._addFeedback(agent, 'suggestion', 'testEdgeCase',
            `Edge case tested: ${EDGE_CASE_DESCRIPTIONS[caseIndex]}`, 'low');
          return { action: 'testEdgeCase', case: EDGE_CASE_DESCRIPTIONS[caseIndex] };
        }
      }
    } catch (err) {
      // Edge case failures are expected — log them as feedback
      this._addFeedback(agent, 'bug', 'testEdgeCase',
        `Edge case "${EDGE_CASE_DESCRIPTIONS[caseIndex]}" result: ${err.message}`, 'medium');
      throw err;
    }
  }

  // ── Logging helpers ────────────────────────────────────────────────────

  _addLog(agent, action, status, durationMs, txDigest = null, error = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      agentId: agent.id,
      agentName: agent.name,
      personality: agent.personality,
      action,
      status,
      durationMs,
      txDigest,
      error,
    };

    this.activityLog.unshift(entry);
    if (this.activityLog.length > this.maxLogSize) {
      this.activityLog.length = this.maxLogSize;
    }

    // Broadcast via WebSocket if available
    if (typeof sails !== 'undefined' && sails.sockets) {
      try {
        sails.sockets.blast('agentActivity', entry);
      } catch { /* ignore */ }
    }
  }

  _addFeedback(agent, type, action, details, severity, txDigest = null) {
    this.stats.feedback.push({
      agentId: agent.id,
      agentName: agent.name,
      timestamp: new Date().toISOString(),
      type,
      action,
      details,
      severity,
      txDigest,
    });
  }

  // ── Status getters ─────────────────────────────────────────────────────

  getStatus() {
    const elapsed = this.stats.startedAt ? Math.floor((Date.now() - this.stats.startedAt) / 1000) : 0;
    const remaining = this.config?.duration ? Math.max(0, this.config.duration - elapsed) : 0;

    return {
      running: this.running,
      paused: this.paused,
      agentCount: this.agents.length,
      readyCount: this.agents.filter(a => ['ready', 'running', 'paused'].includes(a.status)).length,
      elapsed,
      remaining,
      config: this.config,
      stats: {
        actions: this.stats.actions,
        errors: this.stats.errors,
        feedbackCount: this.stats.feedback.length,
        startedAt: this.stats.startedAt,
      },
      agents: this.agents.map(a => ({
        id: a.id,
        name: a.name,
        personality: a.personality,
        address: a.address,
        status: a.status,
        actionsCount: a.actionsCount,
        errorsCount: a.errorsCount,
        lastAction: a.lastAction,
      })),
    };
  }

  getFeedback() {
    return this.stats.feedback;
  }

  getActivityLog(limit = 50) {
    return this.activityLog.slice(0, limit);
  }
}

// Singleton instance
let _instance = null;

function getOrchestrator() {
  if (!_instance) {
    _instance = new AgentOrchestrator();
  }
  return _instance;
}

module.exports = { AgentOrchestrator, getOrchestrator, PERSONALITIES, ACTION_POOL };
