🌍 [English](README.md) | [Italiano](README.it.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt.md) | [中文](README.zh.md) | [日本語](README.ja.md)

<p align="center">
  <img src="https://img.shields.io/badge/IOTA-2.0_Rebased-00f0ff?style=for-the-badge&logo=iota&logoColor=white" alt="IOTA 2.0" />
  <img src="https://img.shields.io/badge/Smart_Contract-Move-8B5CF6?style=for-the-badge" alt="Move" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT" />
</p>

<h1 align="center">IotaPolis</h1>

<p align="center">
  <strong>A fully decentralized community platform with social features, encrypted messaging, governance, marketplace, and escrow — powered by IOTA 2.0 and Move smart contracts.</strong><br/>
  Every post is on-chain. Every user signs with their own wallet. Every payment is trustless.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-features">Features</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-smart-contract">Smart Contract</a> &bull;
  <a href="#-payments--marketplace">Payments</a> &bull;
  <a href="#-social">Social</a> &bull;
  <a href="#-governance">Governance</a> &bull;
  <a href="#-contributing">Contributing</a>
</p>

---

## Why IotaPolis?

Traditional forums depend on a central server that can be shut down, censored, or compromised. **IotaPolis** stores every piece of data on the IOTA 2.0 blockchain as Move smart contract events. The local server is just a cache — the blockchain is the source of truth.

- **True decentralization** — Each user has their own IOTA wallet (Ed25519). The server never holds private keys
- **No single point of failure** — Any node can reconstruct the entire forum from on-chain events
- **Immutable history** — Every post, edit, vote, and reaction is permanently recorded with a transaction digest
- **On-chain permissions** — Roles (User, Moderator, Admin) enforced by the smart contract, not the server
- **Built-in economy** — Tips, subscriptions, paid content, badges, and escrow — all on-chain
- **Social features** — Follow users, react with emoji, send encrypted DMs, vote on polls and proposals
- **Guest mode** — Browse and read without creating a wallet
- **Zero fees on testnet** — IOTA 2.0 Rebased testnet provides free gas via automatic faucet

---

## Quick Start

```bash
# Clone
git clone https://github.com/deduzzo/iotapolis.git
cd iotapolis

# Install dependencies
npm install
cd frontend && npm install && cd ..

# First run — generates server wallet + config
npm run dev
# Wait for "Sails lifted", then Ctrl+C

# Deploy the Move smart contract to IOTA testnet
npm run move:deploy

# Start the forum
npm run dev
```

Open `http://localhost:5173` — browse as a guest, or create a wallet to start posting.

> See [DEPLOY.md](DEPLOY.md) for production deployment, custom networks, and advanced configuration.

---

## Features

### Core Forum

| Feature | Description |
|---------|-------------|
| **On-chain posts** | Every thread, post, reply, vote, and edit is a Move event on IOTA 2.0 |
| **Smart contract roles** | 4-level permission system (Banned/User/Moderator/Admin) enforced by validators |
| **IOTA wallet identity** | Ed25519 keypair with BIP39 mnemonic. Password-encrypted in browser. No accounts needed |
| **Direct signing** | Users sign transactions directly on the blockchain — the server never touches private keys |
| **Guest mode** | Browse and read the entire forum without creating a wallet |
| **Immutable versioning** | Edit history stored on-chain. Every version has a TX digest on the IOTA Explorer |
| **Nested replies** | Threaded discussions with unlimited depth nesting |
| **Voting system** | Upvote/downvote posts. Scores computed from on-chain vote events |
| **Full-text search** | SQLite FTS5 standard index rebuilt from blockchain data |
| **8 languages** | IT, EN, ES, DE, FR, PT, JA, ZH with react-i18next |
| **Connection string** | Share your forum with an 8-segment connection string — anyone can join |

### Social

| Feature | Description |
|---------|-------------|
| **Emoji reactions** | 24 emoji reactions on every post with smooth animations and toggle |
| **Follow/Unfollow** | Follow users on-chain with follower/following counters |
| **Encrypted DMs** | End-to-end encrypted direct messages (X25519 key exchange + AES-256-GCM) |
| **Notifications** | Real-time notifications for mentions, replies, tips, follows, escrow, and DMs via WebSocket |
| **NotificationBell** | Badge count + dropdown with recent notifications in the top bar |

### Payments & Marketplace

| Feature | Description |
|---------|-------------|
| **Tips** | Send IOTA directly to post authors. Preset amounts + custom. All on-chain |
| **Subscriptions** | Tiered plans (Free/Pro/Premium) with configurable prices and durations |
| **Paid content** | Authors set a price for threads. AES-256 encrypted, key delivered after payment |
| **Premium categories** | Admin restricts category access to subscribers of a given tier |
| **Badges** | Admin-configurable purchasable badges displayed next to usernames |
| **Escrow (multi-sig)** | 2-of-3 escrow for services: buyer + seller + arbitrator. Anti-double-rating. Expiry claims |
| **Reputation** | On-chain ratings (1-5 stars) after escrow resolution. Immutable trade history |
| **Marketplace** | Browse paid content, services, and badges in a dedicated page |
| **Treasury** | Forum collects fees (5% marketplace, 2% escrow) to a smart contract treasury |

### Governance

| Feature | Description |
|---------|-------------|
| **On-chain polls** | Create polls with multiple options and deadline. Verifiable vote counts |
| **Governance proposals** | Proposals with quorum requirements and yes/no voting. States: active, passed, rejected, expired |
| **Governance page** | Dedicated page with Polls and Proposals tabs |

### Admin Tools

| Feature | Description |
|---------|-------------|
| **Audit Dashboard** | Transaction explorer, real-time charts, and CSV export |
| **Agent Beta Testers** | Built-in AI agents for stress testing with realistic forum activity |
| **RSS Feeds** | `/api/v1/rss/latest` and `/api/v1/rss/category/:id` endpoints |

### Editor

| Feature | Description |
|---------|-------------|
| **Rich WYSIWYG editor** | Tiptap-based with full toolbar |
| **Markdown output** | Serializes to clean markdown via `tiptap-markdown` |
| **Formatting** | Bold, italic, strikethrough, headings, blockquote, horizontal rule |
| **Code** | Inline code + code blocks with syntax highlighting |
| **Tables** | Insert and edit tables directly |
| **Images** | Insert via URL |
| **Emoji** | Emoji picker (emoji-mart) |
| **@Mentions** | Search and mention users |

### Themes

7 built-in themes with per-user selection:

| Theme | Style | Layout |
|-------|-------|--------|
| **Neon Cyber** | Dark, glassmorphism, cyan neon glow | Card grid |
| **Clean Minimal** | Light, minimal, blue accent | Card grid |
| **Dark Pro** | Dark, professional, green accent | Card grid |
| **Retro Terminal** | Dark, monospace, green neon | Card grid |
| **Invision Light** | Classic forum, white, blue accent | IPB table layout |
| **Invision Dark** | Classic forum, dark gray, blue accent | IPB table layout |
| **Material Ocean** | Material Design, deep navy, teal accent | Card grid |

### Performance & Security

| Feature | Description |
|---------|-------------|
| **Code splitting** | React.lazy on 16+ routes with 4 vendor chunks |
| **PWA** | Service worker with Workbox caching for offline support |
| **Rate limiting** | 100 req/min global, 1 req/min for heavy endpoints |
| **Batch sync** | SQLite transactions for 10-50x faster initial sync |
| **In-memory cache** | TTL-based cache for frequent queries |
| **Admin auth** | Ed25519 signature + timestamp verification for admin endpoints |

### Real-time Sync

| Feature | Description |
|---------|-------------|
| **WebSocket updates** | Granular `dataChanged` events push updates to specific UI components |
| **Optimistic UI** | Posts/votes appear instantly, confirmed asynchronously |
| **Blockchain polling** | Every 30s polls for new on-chain events with persistent cursor |
| **IOTA subscribeEvent** | Native blockchain event subscription (~2s latency) |
| **Cross-node sync** | Multiple servers stay in sync via blockchain events |

---

## Architecture

```
Browser (React 19 + Vite 6 + TailwindCSS 4)
  |
  |-- IOTA Ed25519 wallet (mnemonic-derived, AES-encrypted in localStorage)
  |-- Signs and executes transactions DIRECTLY on blockchain
  |-- E2E encrypted DMs (X25519 + AES-256-GCM)
  |-- PWA with service worker + Capacitor for native mobile
  |-- Code splitting: React.lazy, 16+ routes, 4 vendor chunks
  |
  |  REST API (read-only cache) + Socket.io WebSocket
  v
Server (Sails.js + Node.js) — INDEXER ONLY
  |
  |-- Indexes blockchain events into SQLite cache (batch sync)
  |-- FTS5 standard full-text search
  |-- In-memory cache with TTL
  |-- Rate limiting on all endpoints
  |-- Faucet: sends gas to new users (testnet)
  |-- RSS feeds for latest posts and per-category
  |-- WebSocket broadcast on every state change
  |-- DOES NOT sign or publish transactions for users
  |
  v
Move Smart Contract (on-chain, 6 shared objects)
  |
  |-- Forum: categories, config
  |-- UserRegistry: users, roles, follows
  |-- Treasury: funds, fees, withdrawals
  |-- SubscriptionStore: tiers, subscriptions
  |-- MarketplaceStore: paid content, badges
  |-- GovernanceStore: polls, proposals, votes
  |-- Escrow (per-trade): multi-sig 2-of-3
  |-- AdminCap (owned): deployer capability
  |-- 30+ entry functions with role-gated access
  |-- Emits events for every operation (gzipped JSON payloads)
  |
  v
IOTA 2.0 Rebased (source of truth)
  |
  |-- Events queryable by Package ID
  |-- All nodes see the same data
  |-- Zero fees on testnet
```

---

## Smart Contract

The Move smart contract (`move/forum/sources/forum.move`) is the security backbone. All permissions and payments are enforced by IOTA validators, not by the server.

### 6 Shared Objects

| Object | Purpose |
|--------|---------|
| **Forum** | Categories, global configuration |
| **UserRegistry** | User profiles, roles, follow relationships |
| **Treasury** | Fund management, fee collection |
| **SubscriptionStore** | Subscription tiers and status |
| **MarketplaceStore** | Paid content, purchasable badges |
| **GovernanceStore** | Polls, proposals, quorum voting |

### Role System

| Level | Role | Permissions |
|-------|------|-------------|
| 0 | **BANNED** | All operations rejected by validators |
| 1 | **USER** | Post, reply, vote, react, follow, DM, tip, subscribe, purchase, escrow, poll, proposal |
| 2 | **MODERATOR** | + Create categories, moderate content, ban/unban, arbitrate escrow |
| 3 | **ADMIN** | + Forum config, role management, configure tiers/badges, withdraw treasury |

### Security

- Each user signs with their own Ed25519 keypair — `ctx.sender()` verified by IOTA validators
- The server never holds user private keys
- Escrow uses cross-validated 2-of-3 voting (cannot vote on both sides)
- Anti-double-rating on escrow trades
- Claim expired escrow funds after deadline
- Overpayments automatically refunded
- Banned users rejected at the contract level
- DMs encrypted E2E — server cannot read message content

### Testing

- **25 Move tests** — smart contract logic
- **83 backend tests** — API, sync, handlers
- **45 frontend tests** — components, hooks, pages
- **153 total tests**

---

## Social

### Encrypted DMs

Send private messages to any user. Messages are end-to-end encrypted using X25519 Diffie-Hellman key exchange with AES-256-GCM. The server relays ciphertext but cannot read your conversations. Keys are derived from your wallet mnemonic.

### Follow System

Follow users on-chain. Follower and following counts are displayed on profiles. Follow events trigger notifications.

### Reactions

React to posts with 24 different emoji. Reactions are recorded on-chain and displayed with smooth animations.

---

## Governance

### Polls

Create polls with multiple options and a deadline. Each user votes once. Results are verifiable on-chain.

### Proposals

Submit governance proposals with a quorum requirement. Users vote yes or no. After the deadline, the proposal is marked as passed, rejected, or expired based on quorum and vote count.

---

## Payments & Marketplace

### Tips

Click the tip button on any post to send IOTA directly to the author. Choose from preset amounts (0.1, 0.5, 1.0 IOTA) or enter a custom amount. Tips are instant, on-chain, with zero intermediaries.

### Subscriptions

Admins configure subscription tiers with price and duration. Users subscribe by paying the tier price. The smart contract automatically manages expiration and access control.

### Paid Content

Authors can set a price for their threads. The content is AES-256 encrypted. After payment (on-chain), the buyer receives the decryption key. 5% fee goes to the forum treasury.

### Escrow

For services between users, the buyer locks funds in an on-chain escrow. Three parties (buyer, seller, arbitrator) form a 2-of-3 multi-sig. Any two can release or refund the funds. Anti-double-rating prevents abuse. Expired escrows can be claimed. 2% fee to the forum treasury on resolution.

### Reputation

After every escrow resolution, both parties can leave a rating (1-5 stars + comment). Ratings are immutable on-chain. User profiles display average rating, trade count, success rate, and volume.

---

## Multi-Node

IotaPolis supports multiple independent nodes connected to the same smart contract. Each node:

1. Runs its own Sails.js server + React frontend
2. Has its own SQLite cache (reconstructible)
3. Users sign transactions directly on-chain
4. Syncs from blockchain every 30 seconds

### Joining an Existing Forum

```bash
# Start the server
npm run dev

# In the browser: go to Setup -> "Connect to existing forum"
# Paste the 8-segment connection string
# The system syncs all events from the blockchain
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Blockchain** | IOTA 2.0 Rebased | Testnet |
| **Smart Contract** | Move (IOTA MoveVM) | — |
| **SDK** | @iota/iota-sdk | Latest |
| **Backend** | Sails.js | 1.5 |
| **Runtime** | Node.js | >= 18 |
| **Database** | better-sqlite3 (cache + FTS5) | Latest |
| **Frontend** | React | 19 |
| **Bundler** | Vite | 6 |
| **CSS** | TailwindCSS | 4 |
| **Animations** | Framer Motion | 12 |
| **Editor** | Tiptap (ProseMirror) | 3 |
| **Icons** | Lucide React | Latest |
| **Real-time** | Socket.io | 2 |
| **i18n** | react-i18next | 8 languages |
| **Desktop** | Electron + electron-builder | 33 |
| **Mobile** | Capacitor | Latest |
| **Crypto** | Ed25519 + X25519 + AES-256-GCM + BIP39 | — |
| **PWA** | Workbox | Latest |

---

## Desktop App (Electron)

Available as a standalone desktop application for Windows, macOS, and Linux. The server runs embedded inside the app.

### Download

Download the latest release from [GitHub Releases](https://github.com/deduzzo/iotapolis/releases):

| Platform | File | Auto-update |
|----------|------|-------------|
| **Windows** | `.exe` installer | Yes |
| **macOS** | `.dmg` | Yes |
| **Linux** | `.AppImage` | Yes |

---

## Mobile App (Capacitor)

IotaPolis supports native mobile builds via Capacitor for iOS and Android. The app is also available as a PWA with offline support via service worker.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + frontend in development |
| `npm start` | Start in production mode (single port 1337) |
| `npm run build` | Build frontend for production |
| `npm run move:build` | Compile the Move smart contract |
| `npm run move:deploy` | Compile + deploy contract to IOTA testnet |
| `npm run test` | Run all 153 tests |
| `npm run test:move` | Run 25 Move smart contract tests |
| `npm run test:backend` | Run 83 backend tests |
| `npm run test:frontend` | Run 45 frontend tests |
| `npm run desktop:dev` | Run Electron in development mode |
| `npm run desktop:build` | Build desktop app for current platform |
| `npm run mobile:sync` | Sync web build to native projects |
| `npm run mobile:ios` | Open iOS project in Xcode |
| `npm run mobile:android` | Open Android project in Android Studio |
| `npm run release` | Interactive release script |

---

## API Endpoints

### Public (read-only cache)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List all categories with stats |
| GET | `/api/v1/threads?category=ID&page=N` | List threads in a category |
| GET | `/api/v1/thread/:id` | Thread detail with all posts |
| GET | `/api/v1/posts?thread=ID` | Posts for a thread |
| GET | `/api/v1/user/:id` | User profile + reputation + badges |
| GET | `/api/v1/user/:id/reputation` | User trade reputation |
| GET | `/api/v1/user/:id/subscription` | User subscription status |
| GET | `/api/v1/user/:id/followers` | User followers list |
| GET | `/api/v1/user/:id/following` | User following list |
| GET | `/api/v1/search?q=QUERY` | Full-text search |
| GET | `/api/v1/dashboard` | Forum + payment statistics |
| GET | `/api/v1/marketplace` | Paid content, badges, top sellers |
| GET | `/api/v1/escrows` | Escrow list (filterable) |
| GET | `/api/v1/escrow/:id` | Escrow detail with ratings |
| GET | `/api/v1/tips/:postId` | Tips on a specific post |
| GET | `/api/v1/notifications` | User notifications |
| GET | `/api/v1/messages/:userId` | Encrypted DMs with a user |
| GET | `/api/v1/polls` | List active and past polls |
| GET | `/api/v1/proposals` | List governance proposals |
| GET | `/api/v1/forum-info` | Forum metadata + connection string |
| GET | `/api/v1/rss/latest` | RSS feed of latest posts |
| GET | `/api/v1/rss/category/:id` | RSS feed for a category |
| GET | `/api/v1/audit/transactions` | Admin: transaction explorer |

### Server actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/faucet-request` | Request gas for a new address (rate-limited) |
| POST | `/api/v1/full-reset` | Full reset (admin Ed25519 signature required) |
| POST | `/api/v1/sync-reset` | Cache reset + resync (admin Ed25519 signature required) |

All write operations (posts, votes, reactions, follows, DMs, polls, proposals, moderation, payments, escrow) are executed directly on the IOTA blockchain by the user's wallet. The server is a read-only indexer.

---

## How Identity Works

1. **Browse** — Explore the forum as a guest without any wallet
2. **Generate** — When ready, create an Ed25519 keypair from a BIP39 mnemonic (12 words) with one click
3. **Encrypt** — Mnemonic encrypted with your password (AES-256-GCM + PBKDF2) and stored in localStorage
4. **Faucet** — Backend sends gas IOTA to the new address (testnet)
5. **Register** — Call `register()` on the Move contract directly
6. **Sign** — Every action (post, vote, tip, react, follow, DM, escrow) is a transaction signed with your Ed25519 key
7. **Verify** — `ctx.sender()` verified by IOTA validators at the protocol level
8. **Backup** — Export your 12-word mnemonic to restore on any device

No passwords on the server. No emails. No accounts. Your wallet is your identity.

---

## Contributing

Contributions are welcome! This project is in active development.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run test`
5. Commit: `git commit -m 'feat: add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built on IOTA 2.0 Rebased</strong><br/>
  <em>Every post is a transaction. Every permission is a smart contract. Every user is a wallet.</em>
</p>
