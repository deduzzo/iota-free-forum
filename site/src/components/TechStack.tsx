const techs = [
  { name: 'IOTA 2.0', desc: 'Rebased L1 blockchain', color: '#6c63ff' },
  { name: 'Move', desc: 'Smart contract language', color: '#a78bfa' },
  { name: 'React 19', desc: 'Frontend framework', color: '#61dafb' },
  { name: 'Sails.js', desc: 'Backend indexer', color: '#38bdf8' },
  { name: 'Electron', desc: 'Desktop application', color: '#47848f' },
  { name: 'Capacitor', desc: 'Native mobile (iOS/Android)', color: '#53b9ff' },
  { name: 'SQLite', desc: 'Local cache / FTS5 search', color: '#003b57' },
  { name: 'X25519', desc: 'E2E encrypted messaging', color: '#f472b6' },
  { name: 'GovernanceStore', desc: 'On-chain polls & proposals', color: '#fbbf24' },
];

export default function TechStack() {
  return (
    <section className="py-24 px-4 max-w-5xl mx-auto">
      <div className="text-center mb-16 scroll-reveal">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="gradient-text">Tech Stack</span>
        </h2>
        <p className="text-gray-400 text-lg">Built on proven, modern technology.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {techs.map((t, i) => (
          <div key={t.name} className="scroll-reveal glass rounded-2xl p-6 text-center hover:scale-105 transition-all duration-300" style={{ transitionDelay: `${i * 0.05}s` }}>
            <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center text-xl font-bold" style={{ backgroundColor: `${t.color}20`, color: t.color }}>
              {t.name[0]}
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">{t.name}</h3>
            <p className="text-gray-500 text-sm">{t.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
