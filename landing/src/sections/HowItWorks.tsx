import { useReveal } from '../hooks/useReveal';

export function HowItWorks() {
  const { ref, visible } = useReveal();

  const STEPS = [
    { num: '01', title: "You describe what you want", body: "Type 'Swap 100 USDC for AVAX on Pangolin' — plain English, no menus." },
    { num: '02', title: "The AI parses your intent", body: "Claude extracts the action, tokens, amounts, and slippage. Confidence below 70%? It asks you to clarify." },
    { num: '03', title: "The right tool is selected", body: "Aegis searches a registry of community-published Tool Manifests and picks the best match for your intent and chain." },
    { num: '04', title: "Pre-flight simulation", body: "The calldata is simulated via eth_call before anything is signed. Token deltas are shown. If the simulation fails, execution stops — no gas burned." },
    { num: '05', title: "You confirm, it executes", body: "Your ERC-4337 Smart Account executes via a scoped Session Key. You never touch a private key." },
  ];

  return (
    <section className="py-32 px-6 bg-white/[0.02]">
      <div className="max-w-4xl mx-auto">
        <div className={`text-center mb-20 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`} ref={ref}>
          <span className="text-[10px] tracking-widest text-violet-400 uppercase font-semibold mb-3 block">
            How It Works
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            From intent to on-chain, in seconds.
          </h2>
        </div>

        <div className="relative pl-4 md:pl-0">
          <div className="absolute left-[1.875rem] md:left-[2.1rem] top-4 bottom-4 w-px border-l-2 border-dotted border-white/10" />
          
          <div className="space-y-12">
            {STEPS.map((step, idx) => {
              const { ref: stepRef, visible: stepVisible } = useReveal();

              return (
                <div key={idx} ref={stepRef} className={`relative flex items-start gap-6 transition-all duration-700 ${stepVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                  <div className="shrink-0 w-8 h-8 mt-4 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] font-bold tracking-widest text-violet-400 flex items-center justify-center z-10 relative bg-[#0f0f1a]">
                    {step.num}
                  </div>

                  <div className={`w-full bg-white/5 border border-white/10 rounded-2xl p-6 border-l-2 border-l-violet-500 hover:border-white/20 transition-all`}>
                    <h3 className="font-semibold text-white mb-2">{step.title}</h3>
                    <p className="text-sm text-white/50 leading-relaxed">{step.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
