import { useReveal } from '../hooks/useReveal';

export function Features() {
  const { ref, visible } = useReveal();

  const CARDS = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-400">
           <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      chipBg: 'bg-violet-500/10 border-violet-500/20',
      title: "Non-Custodial by Design",
      body: "ERC-4337 Smart Accounts. Session Keys with scoped permissions. The bot never holds your master key."
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
           <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      chipBg: 'bg-emerald-500/10 border-emerald-500/20',
      title: "Pre-Flight Simulator",
      body: "Every transaction is simulated before signing. You see exact token deltas before committing."
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      chipBg: 'bg-indigo-500/10 border-indigo-500/20',
      title: "Natural Language Interface",
      body: "Powered by Claude. No menus, no forms — describe what you want and the agent figures out the rest."
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
           <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
      chipBg: 'bg-amber-500/10 border-amber-500/20',
      title: "Verified Token Registry",
      body: "Symbol → address mapping with chain filters. No token spoofing, no fake contract attacks."
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-400">
           <path strokeLinecap="round" strokeLinejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
        </svg>
      ),
      chipBg: 'bg-violet-500/10 border-violet-500/20',
      title: "Community Tool Registry",
      body: "Third-party developers publish Tool Manifests. Any protocol can integrate — no gatekeeping."
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
           <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      chipBg: 'bg-emerald-500/10 border-emerald-500/20',
      title: "On-Chain Fee Sharing",
      body: "Every tool execution routes a revenue share to its contributor. Build once, earn on every use."
    }
  ];

  return (
    <section id="features" className="py-32 px-6 max-w-7xl mx-auto">
      <div className={`text-center mb-16 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`} ref={ref}>
        <span className="text-[10px] tracking-widest text-violet-400 uppercase font-semibold mb-3 block">
          Built Different
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Security and openness, not a trade-off.
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {CARDS.map((card, idx) => (
          <div key={idx} className={`bg-transparent border border-transparent hover:bg-white/[0.08] hover:border-white/20 transition-all duration-200 hover:-translate-y-1 rounded-2xl p-6 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: `${idx * 100}ms` }}>
            <div className={`w-10 h-10 rounded-xl border ${card.chipBg} flex items-center justify-center mb-5`}>
              {card.icon}
            </div>
            <h3 className="font-semibold text-white mb-2 text-sm">{card.title}</h3>
            <p className="text-xs text-white/50 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
