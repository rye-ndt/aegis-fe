import { Fragment } from 'react';
import { useReveal } from '../hooks/useReveal';

export function Architecture() {
  const { ref, visible } = useReveal();

  const LAYERS = [
    { name: "Intelligence Layer", emoji: "🧠", accent: "border-violet-500", chips: ["Intent Parser", "Semantic Router", "Token Registry", "LLM (Claude)"] },
    { name: "Execution Layer", emoji: "⚙️", accent: "border-indigo-500", chips: ["Solver Engine", "Tool Manifests", "Pre-Flight Simulator"] },
    { name: "On-Chain Layer", emoji: "🔗", accent: "border-emerald-500", chips: ["ERC-4337 SCA", "Session Keys", "Paymaster", "Fee Splitter"] },
    { name: "Interface Layer", emoji: "💬", accent: "border-amber-500", chips: ["Telegram Agent", "Developer Portal", "Result Parser"] },
  ];

  return (
    <section id="architecture" className="py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <div ref={ref} className={`text-center mb-16 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="text-[10px] tracking-widest text-violet-400 uppercase font-semibold mb-3 block">
            Protocol Architecture
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Four layers. One seamless experience.
          </h2>
        </div>

        <div className="flex flex-col items-center">
          {LAYERS.map((layer, idx) => {
            const { ref: layerRef, visible: layerVisible } = useReveal();
            return (
              <Fragment key={idx}>
                <div 
                  ref={layerRef}
                  className={`w-full rounded-2xl border border-white/10 bg-white/5 px-6 lg:px-8 py-5 border-l-4 ${layer.accent} transition-all duration-700 ${layerVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12"}`}
                  style={{ transitionDelay: `${idx * 150}ms` }}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                    <div className="flex items-center gap-3 md:w-1/4">
                      <span className="text-2xl">{layer.emoji}</span>
                      <h3 className="font-semibold text-white whitespace-nowrap">{layer.name}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 md:flex-1">
                      {layer.chips.map((chip, i) => (
                        <div key={i} className="rounded-full bg-white/8 border border-white/10 px-3 py-1 text-xs text-white/60">
                          {chip}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {idx < LAYERS.length - 1 && (
                  <div className={`w-px h-8 bg-gradient-to-b from-white/20 to-transparent transition-opacity duration-700 ${layerVisible ? 'opacity-100' : 'opacity-0'}`} />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
