const categories = [
  {
    label: 'Forum',
    features: [
      { icon: '\u{1F517}', title: 'Fully Decentralized', desc: 'Every action is signed by your wallet and verified on-chain. No intermediaries, no censorship.' },
      { icon: '\u{1F45B}', title: 'Integrated Wallet', desc: 'Ed25519 wallet derived from BIP39 mnemonic. Your keys, your identity.' },
      { icon: '\u{1F441}\u{FE0F}', title: 'Guest Mode', desc: 'Browse and read without creating a wallet. Join when you are ready.' },
      { icon: '\u{1F50D}', title: 'Full-Text Search', desc: 'SQLite FTS5 index rebuilt from blockchain data. Fast and accurate.' },
    ],
  },
  {
    label: 'Social',
    features: [
      { icon: '\u{1F4AC}', title: 'Encrypted DMs', desc: 'End-to-end encrypted direct messages with X25519 key exchange + AES-256-GCM.' },
      { icon: '\u{1F514}', title: 'Real-Time Notifications', desc: 'Mentions, replies, tips, follows, and DMs delivered instantly via WebSocket.' },
      { icon: '\u{1F60D}', title: 'Reactions', desc: '24 emoji reactions on every post with smooth animations and toggle support.' },
      { icon: '\u{1F465}', title: 'Follow System', desc: 'Follow users on-chain with follower/following counters and activity feeds.' },
    ],
  },
  {
    label: 'Economy',
    features: [
      { icon: '\u{1F4B8}', title: 'On-Chain Payments', desc: 'Tips, subscriptions, and content purchases — all handled by the smart contract.' },
      { icon: '\u{1F91D}', title: 'Multi-Sig Escrow', desc: '2-of-3 escrow for services between users. Dispute resolution and expiry claims built in.' },
      { icon: '\u{1F3EA}', title: 'Marketplace', desc: 'Buy and sell content, services, and badges. 5% marketplace fee managed on-chain.' },
      { icon: '\u{2B50}', title: 'Reputation', desc: 'On-chain ratings after escrow trades. Anti-double-rating protection.' },
    ],
  },
  {
    label: 'Governance',
    features: [
      { icon: '\u{1F5F3}\u{FE0F}', title: 'On-Chain Polls', desc: 'Create polls with multiple options and verifiable votes. Deadline enforcement.' },
      { icon: '\u{1F4DC}', title: 'Proposals', desc: 'Governance proposals with quorum requirements and yes/no voting.' },
    ],
  },
  {
    label: 'Admin Tools',
    features: [
      { icon: '\u{1F4CA}', title: 'Audit Dashboard', desc: 'Transaction explorer, real-time charts, and CSV export for full transparency.' },
      { icon: '\u{1F916}', title: 'Agent Testers', desc: 'Built-in AI agents for stress testing your forum with realistic activity.' },
      { icon: '\u{1F4E1}', title: 'RSS Feeds', desc: 'RSS endpoints for latest posts and per-category feeds.' },
    ],
  },
  {
    label: 'Platform',
    features: [
      { icon: '\u{1F30D}', title: '8 Languages', desc: 'Internationalized UI with react-i18next. Community without borders.' },
      { icon: '\u{1F3A8}', title: '7 Themes', desc: 'Dark mode, light mode, and 5 more. Make it yours.' },
      { icon: '\u{1F5A5}\u{FE0F}', title: 'Desktop App', desc: 'Electron app with auto-updates for Windows, macOS, and Linux.' },
      { icon: '\u{1F4F1}', title: 'Mobile App', desc: 'Native iOS and Android via Capacitor. PWA with offline support.' },
    ],
  },
];

export default function Features() {
  return (
    <section className="py-24 px-4 max-w-7xl mx-auto">
      <div className="text-center mb-16 scroll-reveal">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="gradient-text">Features</span>
        </h2>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          A complete decentralized platform, not just a forum.
        </p>
      </div>
      {categories.map((cat, ci) => (
        <div key={cat.label} className="mb-16">
          <h3 className="scroll-reveal text-2xl font-semibold text-white mb-6 flex items-center gap-3">
            <span className="w-8 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
            {cat.label}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cat.features.map((f, i) => (
              <div key={f.title} className="scroll-reveal glass rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(108,99,255,0.15)]" style={{ transitionDelay: `${(ci * 4 + i) * 0.03}s` }}>
                <div className="text-3xl mb-4">{f.icon}</div>
                <h4 className="text-lg font-semibold mb-2 text-white">{f.title}</h4>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
