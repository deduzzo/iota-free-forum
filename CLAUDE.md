# IotaPolis — Project Context

## Overview

Piattaforma community decentralizzata su IOTA 2.0 Rebased con smart contract Move.
Ogni utente ha il proprio wallet IOTA (Ed25519) e firma transazioni direttamente.
Il server e solo un indexer/cache — non firma mai per conto degli utenti.
Include sistema pagamenti completo: tip, abbonamenti, marketplace, escrow multi-sig.
Include funzionalita social: notifiche, DM encrypted E2E, reactions, follow/unfollow, governance on-chain.

## Architecture

### Smart Contract Move (`move/forum/sources/forum.move`)

Il contratto e il cuore del sistema. Refactored da 1 Forum monolitico a **6 shared objects paralleli**:

- **Forum** (shared object): dati forum, categorie, configurazione globale
- **UserRegistry** (shared object): registro utenti con ruoli, profili, follow relations
- **Treasury** (shared object): gestione fondi, fee collection, withdraw
- **SubscriptionStore** (shared object): tier di abbonamento, status utenti
- **MarketplaceStore** (shared object): contenuti a pagamento, badge acquistabili
- **GovernanceStore** (shared object): sondaggi (polls) e proposte governance con quorum
- **AdminCap** (owned object): capability del deployer
- **Escrow** (shared objects): escrow multi-sig 2-di-3 per servizi tra utenti

Shared objects separati = transazioni parallele senza contesa (parallelismo IOTA).

Ruoli on-chain: 0=BANNED, 1=USER, 2=MODERATOR, 3=ADMIN

Entry functions: register, post_event, mod_post_event, admin_post_event, set_user_role,
tip, subscribe, renew_subscription, purchase_content, purchase_badge, configure_tier,
configure_badge, create_escrow, mark_delivered, open_dispute, vote_release, vote_refund,
rate_trade, withdraw_funds, claim_expired, follow, unfollow, create_poll, vote_poll,
create_proposal, vote_proposal

### Backend (Sails.js) — INDEXER ONLY

Il backend NON firma transazioni. E un puro indexer:
- `api/utility/iota.js` — SDK wrapper, query eventi, subscribe
- `api/utility/ForumManager.js` — Sync blockchain -> SQLite, usa `eventAuthor` (verificato on-chain), batch sync con SQLite transaction (10-50x faster), repairSync incrementale, cursore polling persistente
- `api/utility/db.js` — SQLite schema con FTS5 standard (users, threads, posts, votes, tips, escrows, reputations, badges, notifications, messages, reactions, follows, polls, proposals, ecc.)
- `api/utility/cache.js` — Cache in-memory con TTL per query frequenti
- `api/controllers/` — REST API read-only + faucet + RSS feed + audit
- `api/middleware/rateLimit.js` — Rate limiting tutte le API (100/min globale, 1/min per heavy endpoints)
- `config/private_iota_conf.js` — Config con mnemonic server (solo per faucet), chiavi RSA legacy (gitignored)

### Frontend (React 19 + Vite 6 + TailwindCSS 4)

- `frontend/src/api/crypto.js` — Ed25519 keypair (IOTA SDK), BIP39 mnemonic, AES-256-GCM encryption, X25519 key exchange per DM
- `frontend/src/hooks/useIdentity.js` — Wallet management, mnemonic encrypt/decrypt, direct TX signing, UnlockGuard con auto-unlock e "Ricordami"
- `frontend/src/hooks/useWallet.js` — Pagamenti: tip, subscribe, purchase, escrow, faucet
- `frontend/src/hooks/useNotifications.js` — Notifiche in-app real-time via WebSocket
- `frontend/src/hooks/useMessages.js` — DM encrypted E2E con X25519 + AES-256-GCM
- `frontend/src/hooks/useGovernance.js` — Sondaggi e proposte governance
- `frontend/src/pages/` — Home, Thread, Category, Identity, Settings, Admin, Dashboard, Setup, NewThread, Wallet, Marketplace, EscrowDashboard, Subscription, Governance, Messages, Profile, AuditDashboard, AgentTesters
- `frontend/src/components/` — RichEditor, PostCard, ThreadList, TipButton, ReputationBadge, PaywallGate, EscrowCard, IdentityBadge, Layout, NotificationBell, ReactionBar, FollowButton, GuestBanner, PasswordStrength, MobileBottomNav
- `frontend/src/i18n/` — 8 lingue con react-i18next
- `frontend/src/contexts/ThemeContext.jsx` — 7 temi
- Code splitting: React.lazy su 16+ route, vendor chunk splitting (4 bundle)
- PWA completa con service worker e workbox caching

### Desktop (Electron)

- `desktop/main.js` — Avvia Sails + apre BrowserWindow
- Auto-update via GitHub Releases (electron-updater)

### Mobile (Capacitor)

- `capacitor.config.ts` — Configurazione Capacitor per iOS/Android
- Build native con `npx cap sync` dopo `npm run build`

## Security Model

- Ogni utente ha un wallet IOTA Ed25519 proprio (derivato da mnemonic BIP39)
- L'utente firma transazioni DIRETTAMENTE sulla blockchain
- `ctx.sender()` verificato dai validatori IOTA a livello di protocollo
- Il server NON possiede chiavi private degli utenti
- Il server NON firma transazioni per conto degli utenti
- `ForumManager.processTransaction()` usa `eventAuthor` dal campo `author` dell'evento blockchain
- `data.authorId` dal payload viene IGNORATO (prevenzione impersonazione)
- Escrow: voti cross-validati (non puoi votare su entrambi i lati), anti doppio-rating
- Escrow: `claim_expired` per escrow scaduti (deadline enforcement)
- Overpayment: resto restituito automaticamente
- Endpoint admin (full-reset, sync-reset): richiedono firma Ed25519 verificata con timestamp
- Faucet: rate limit per address + cooldown globale + limite per IP
- Rate limiting su tutte le API: 100 req/min globale, 1 req/min per heavy endpoints
- FTS5 standard (migrata da contentless) per search robusto con delete
- DM: encryption E2E con X25519 key exchange + AES-256-GCM (server non puo leggere)
- Guest mode: lettura senza wallet (nessuna chiave necessaria per browse)

## Key Files

| File | Descrizione |
|------|-------------|
| `move/forum/sources/forum.move` | Smart contract — 6 shared objects, ruoli, pagamenti, escrow, governance |
| `api/utility/iota.js` | IOTA SDK — query, subscribe |
| `api/utility/ForumManager.js` | Sync blockchain, handler eventi, batch sync, cache TTL |
| `api/utility/db.js` | Schema SQLite + model factory (tutte le tabelle incluse notifications, messages, reactions, polls) |
| `api/utility/cache.js` | Cache in-memory con TTL |
| `api/middleware/rateLimit.js` | Rate limiting globale e per-endpoint |
| `api/controllers/faucet-request.js` | Faucet gas per nuovi utenti (rate limited) |
| `api/controllers/rss.js` | RSS feed (/api/v1/rss/latest, /api/v1/rss/category/:id) |
| `api/controllers/audit.js` | Admin Audit Dashboard: transaction explorer, export CSV |
| `config/bootstrap.js` | Init wallet (solo faucet), sync, polling |
| `config/routes.js` | Tutte le route API |
| `frontend/src/api/crypto.js` | Ed25519 keypair, BIP39, AES-256-GCM, X25519 DH, IOTA client |
| `frontend/src/hooks/useIdentity.js` | Wallet management, TX signing, mnemonic, UnlockGuard |
| `frontend/src/hooks/useWallet.js` | Pagamenti: tip, subscribe, escrow, badge |
| `frontend/src/hooks/useNotifications.js` | Notifiche in-app real-time |
| `frontend/src/hooks/useMessages.js` | DM encrypted E2E |
| `frontend/src/hooks/useGovernance.js` | Sondaggi e proposte on-chain |
| `frontend/src/components/TipButton.jsx` | Pulsante tip su ogni post |
| `frontend/src/components/EscrowCard.jsx` | Card escrow con azioni e rating |
| `frontend/src/components/NotificationBell.jsx` | Bell con badge + dropdown + WebSocket |
| `frontend/src/components/ReactionBar.jsx` | Reactions emoji (24 emoji, toggle, animazioni) |
| `frontend/src/components/FollowButton.jsx` | Follow/Unfollow con contatori |
| `frontend/src/components/GuestBanner.jsx` | Banner invito registrazione per guest |
| `frontend/src/pages/Wallet.jsx` | Pagina wallet: saldo, transazioni, invio |
| `frontend/src/pages/Marketplace.jsx` | Marketplace: contenuti, servizi, badge |
| `frontend/src/pages/Governance.jsx` | Sondaggi e proposte governance |
| `frontend/src/pages/Messages.jsx` | DM encrypted E2E |
| `frontend/src/pages/AuditDashboard.jsx` | Admin: transaction explorer, grafici, export CSV |
| `frontend/src/pages/AgentTesters.jsx` | Agent AI built-in per stress test |

## Real-time Sync

1. **WebSocket** (stesso server): broadcast `dataChanged` con `entity` + `action` (notifiche incluse)
2. **Blockchain polling** (cross-node): ogni 30s `pollNewEvents()` via cursor incrementale persistente
3. **IOTA subscribeEvent**: notifica nativa ~2s (con fallback a polling)
4. **Auto-repair**: ogni 60s `repairSync()` incrementale confronta cache vs blockchain
5. **Batch sync**: transazioni SQLite raggruppate (10-50x faster su sync iniziale)

## Event Tags

| Tag | Function | Ruolo minimo |
|-----|----------|-------------|
| FORUM_USER | register() | Nessuno |
| FORUM_THREAD | post_event() | USER |
| FORUM_POST | post_event() | USER |
| FORUM_VOTE | post_event() | USER |
| FORUM_CATEGORY | mod_post_event() | MODERATOR |
| FORUM_MODERATION | mod_post_event() | MODERATOR |
| FORUM_ROLE | admin_post_event() | ADMIN |
| FORUM_CONFIG | admin_post_event() | ADMIN |
| FORUM_TIP | (on-chain event) | USER |
| FORUM_SUBSCRIPTION | (on-chain event) | USER |
| FORUM_PURCHASE | (on-chain event) | USER |
| FORUM_BADGE | (on-chain event) | USER |
| FORUM_ESCROW_CREATED | (on-chain event) | USER |
| FORUM_ESCROW_UPDATED | (on-chain event) | USER |
| FORUM_RATING | (on-chain event) | USER |
| FORUM_DM | post_event() | USER |
| FORUM_FOLLOW | post_event() | USER |
| FORUM_UNFOLLOW | post_event() | USER |
| FORUM_POLL | post_event() | USER |
| FORUM_POLL_VOTE | post_event() | USER |
| FORUM_PROPOSAL | post_event() | USER |
| FORUM_PROPOSAL_VOTE | post_event() | USER |
| FORUM_REACTION | post_event() | USER |

## Convenzioni

- Dati on-chain sempre gzippati (JSON -> gzip -> vector<u8>)
- Identita utente = indirizzo IOTA (0x...), non piu USR_
- Ogni azione firmata dall'utente con Ed25519 nativo IOTA
- Backend verifica `eventAuthor` dall'evento blockchain, non dal payload
- Cache SQLite ricostruibile: sync da eventi blockchain
- Connection string (8 segmenti): `network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId:governanceStoreId`
- Pagamenti: il contratto gestisce treasury, fee (5% marketplace, 2% escrow)
- Escrow: 2-di-3 multi-sig, voti cross-validati, anti doppio-rating, deadline enforcement, claim_expired
- Overpayment: resto automatico al sender
- Guest mode: accesso in lettura senza wallet
- DM: E2E encrypted, X25519 key exchange, il server non legge il contenuto

## Comandi

```bash
# Development
npm run dev              # Backend + frontend (2 porte: 1337 + 5173)
npm start                # Produzione (porta unica 1337)
npm run build            # Build frontend -> .tmp/public/

# Smart Contract
npm run move:build       # Compila contratto Move
npm run move:deploy      # Compila + deploya su testnet

# Test
npm run test             # Tutti i test (153 totali)
npm run test:move        # 25 test Move
npm run test:backend     # 83 test backend
npm run test:frontend    # 45 test frontend

# Desktop (Electron)
npm run desktop:dev      # Electron in dev mode
npm run desktop:build    # Build per piattaforma corrente
npm run desktop:build:win    # Build Windows .exe
npm run desktop:build:mac    # Build macOS .dmg
npm run desktop:build:linux  # Build Linux .AppImage

# Mobile (Capacitor)
npm run mobile:sync      # Sync web build -> native projects
npm run mobile:ios       # Apri progetto iOS in Xcode
npm run mobile:android   # Apri progetto Android in Android Studio

# Release
npm run release          # Script interattivo: version bump -> build -> tag -> GitHub Release

# Sito / Documentazione
cd site && npm run dev       # Dev server locale (localhost:4321)
cd site && npm run build     # Build statico -> site/dist/
cd site && npm run preview   # Preview build locale
```

## Sito Web & Documentazione (site/)

### Dominio e Hosting
- **URL**: https://iotapolis.io
- **Hosting**: GitHub Pages (deploy automatico via GitHub Actions)
- **CNAME**: `site/public/CNAME` contiene `iotapolis.io`
- **DNS**: 4 record A che puntano ai server GitHub Pages (185.199.108-111.153)
- **SSL**: Certificato Let's Encrypt automatico via GitHub Pages
- **Workflow**: `.github/workflows/deploy-site.yml` — trigger su push a `main` (path `site/**`)

### Tech Stack Sito
- **Astro 5** — framework statico, build ultra-veloce
- **Starlight** (plugin Astro) — tema documentazione con sidebar, search, dark mode
- **React 19** — componenti landing page (Hero, Features, HowItWorks, TechStack, Footer)
- **TailwindCSS 4** — via `@tailwindcss/vite` plugin
- **Content Collections** — docs in `.mdx` con `docsLoader()` + `docsSchema()` (Starlight 0.32+)

### Struttura
```
site/
├── astro.config.mjs          # Config: site URL, base path, Starlight sidebar, integrations
├── src/content.config.ts     # Content collection con docsLoader() (richiesto da Starlight 0.32)
├── src/pages/index.astro     # Landing page (usa Layout custom, non Starlight)
├── src/layouts/Landing.astro # Layout landing: importa global.css, IntersectionObserver
├── src/components/*.tsx      # React: Hero, Features, HowItWorks, TechStack, Footer
├── src/styles/global.css     # TailwindCSS + Starlight dark theme vars + animazioni
├── src/content/docs/         # Documentazione MDX (Starlight)
│   ├── getting-started/      # installation, quick-start, configuration
│   ├── architecture/         # overview, smart-contract, backend, frontend
│   ├── guides/               # wallet, payments, escrow, marketplace, notifications, messaging, social, governance, agents, audit
│   └── api/                  # endpoints
├── public/CNAME              # Custom domain per GitHub Pages
└── public/favicon.svg        # Favicon gradient "iP"
```

### Come Aggiornare
- **Documentazione**: modifica i file `.mdx` in `site/src/content/docs/`, push su main
- **Landing page**: modifica i componenti React in `site/src/components/`
- **Stili**: `site/src/styles/global.css` (TailwindCSS + animazioni custom)
- **Sidebar docs**: modifica `sidebar` in `site/astro.config.mjs`
- **Deploy**: automatico su push a main (path `site/**`)

### Note Importanti
- La landing page usa un layout custom (`Landing.astro`), NON il tema Starlight
- `Landing.astro` deve importare `../styles/global.css` per TailwindCSS
- Le docs usano Starlight con `customCss: ['./src/styles/global.css']`
- `image.service: noop` in astro.config per evitare dipendenza da `sharp`
- `@astrojs/sitemap` override a 3.2.1 per compatibilita Zod 3.x vs 4.x

### README Multilingua
8 versioni del README: `README.md` (EN), `.it.md`, `.es.md`, `.fr.md`, `.de.md`, `.pt.md`, `.zh.md`, `.ja.md`
Ogni file ha il language selector in cima con link a tutte le versioni.

## Mainnet Preparation Checklist

- [ ] Smart contract audit (professional or community peer review)
- [ ] All 25+ Move tests passing
- [ ] 153 total tests passing (25 Move, 83 backend, 45 frontend)
- [ ] Connection string format (8 segmenti): `network:packageId:forumId:registryId:treasuryId:subscriptionStoreId:marketplaceStoreId:governanceStoreId`
- [ ] Faucet strategy for mainnet (sponsored TX or user-funded)
- [ ] Gas fee estimation per action type
- [ ] Migration tool: export testnet data -> import on mainnet
- [ ] Desktop app updated with mainnet network option
- [ ] Mobile app builds (Capacitor iOS/Android)
- [ ] Site/docs updated with mainnet instructions
- [ ] Backup AdminCap recovery strategy (multi-sig recommended)
- [ ] Rate limiting tuned for production traffic
- [ ] DM encryption key rotation strategy
