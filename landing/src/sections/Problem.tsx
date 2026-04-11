import { useReveal } from '../hooks/useReveal';

export function Problem() {
  const { ref, visible } = useReveal();

  const CARDS = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      chipBg: 'bg-amber-500/10',
      title: "UX That Locks People Out",
      body: "Complex UIs, manual calldata, seed phrase anxiety. 99% of users stop at the interface."
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
      chipBg: 'bg-red-500/10',
      title: "The Private Key Trap",
      body: "Existing Telegram bots ask for your private key. One breach empties every wallet they hold."
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      chipBg: 'bg-slate-500/10',
      title: "Monolithic, Closed Bots",
      body: "Today's bots only support what their team built. No community, no composability, no ecosystem."
    }
  ];

  return (
    <section id="problem" className="py-32 px-6 max-w-7xl mx-auto">
      <div ref={ref} className={`text-center mb-16 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <span className="text-[10px] tracking-widest text-violet-400 uppercase font-semibold mb-3 block">
          The Problem
        </span>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          DeFi is broken for everyone.
        </h2>
        <p className="text-white/50 text-base max-w-xl mx-auto">
          Three failure modes that Aegis solves.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {CARDS.map((card, idx) => (
          <div key={idx} className={`bg-white/5 border border-white/8 hover:border-white/20 transition-all duration-300 rounded-2xl p-6 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: `${idx * 150}ms` }}>
            <div className={`w-10 h-10 rounded-xl ${card.chipBg} border border-white/5 flex items-center justify-center mb-5`}>
              {card.icon}
            </div>
            <h3 className="font-semibold text-white mb-3">{card.title}</h3>
            <p className="text-sm text-white/50 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
