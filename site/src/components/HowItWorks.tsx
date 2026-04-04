const steps = [
  { num: '01', title: 'Browse as Guest', desc: 'Explore the forum without creating a wallet. Read threads, browse categories, and see what the community is about — no signup required.' },
  { num: '02', title: 'Create Your Wallet', desc: 'When you are ready, generate a wallet with a single click. A secure mnemonic is created and encrypted with your password. No email, no server accounts.' },
  { num: '03', title: 'Join the Community', desc: 'Register on-chain with a single transaction. Post threads, react with emoji, follow other users, vote on polls, and send encrypted DMs — all signed by you.' },
  { num: '04', title: 'Exchange Value', desc: 'Tip creators, subscribe to content, trade services through multi-sig escrow, and participate in governance proposals. The smart contract handles everything.' },
];

export default function HowItWorks() {
  return (
    <section className="py-24 px-4 max-w-5xl mx-auto">
      <div className="text-center mb-16 scroll-reveal">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="gradient-text">How It Works</span>
        </h2>
      </div>
      <div className="space-y-12">
        {steps.map((step, i) => (
          <div key={step.num} className="scroll-reveal flex flex-col md:flex-row items-start gap-6 glass rounded-2xl p-8" style={{ transitionDelay: `${i * 0.15}s` }}>
            <div className="text-5xl font-bold gradient-text shrink-0 w-20">{step.num}</div>
            <div>
              <h3 className="text-2xl font-semibold mb-3 text-white">{step.title}</h3>
              <p className="text-gray-400 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
