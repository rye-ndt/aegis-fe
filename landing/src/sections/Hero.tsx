import { useState, useEffect } from 'react';
import { useReveal } from '../hooks/useReveal';

const SCRIPT = [
  { role: "user",  text: "Swap 100 USDC for AVAX" },
  { role: "agent", text: "Simulating...", typing: true },
  { role: "agent", text: "Pre-flight passed ✓\nYou send:  100 USDC\nYou get:   ≈ 2.41 AVAX\nGas:       sponsored\n\nType /confirm to execute." },
  { role: "user",  text: "/confirm" },
  { role: "agent", text: "Done. tx: 0xabc…def ✓" },
];

export function Hero() {
  const { ref, visible } = useReveal();
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    let timeouts: ReturnType<typeof setTimeout>[] = [];
    
    const playSequence = () => {
      setVisibleLines(0);
      let cumulativeDelay = 1000;
      
      SCRIPT.forEach((_, index) => {
        timeouts.push(setTimeout(() => {
          setVisibleLines(index + 1);
        }, cumulativeDelay));
        
        cumulativeDelay += 800;
      });
      
      timeouts.push(setTimeout(() => {
        playSequence();
      }, cumulativeDelay + 2500));
    };

    playSequence();

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <section ref={ref} className={`relative min-h-dvh flex items-center pt-16 overflow-hidden transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
      
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-violet-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-indigo-600/15 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 relative z-10 py-20">
        
        <div className="flex flex-col justify-center">
          <span className="text-[10px] tracking-widest text-violet-400 uppercase font-semibold mb-6">
            Intent-Based AI Agent · Avalanche
          </span>
          <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight mb-4">
            Say what you want.<br/>We handle the chain.
          </h1>
          <p className="text-base text-white/50 max-w-md leading-relaxed mb-8">
            Aegis turns natural language into verified on-chain transactions — without ever touching your private key.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="https://t.me/" target="_blank" rel="noreferrer" className="flex items-center justify-center bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-6 py-3 text-sm shadow-[0_8px_32px_rgba(124,58,237,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all">
              Open in Telegram
            </a>
            <a href="#developers" className="flex items-center justify-center border border-white/10 text-white/70 hover:border-white/20 rounded-xl px-6 py-3 text-sm hover:scale-[1.02] active:scale-[0.98] transition-all">
              Read the Docs
            </a>
          </div>
        </div>

        <div className="flex items-center justify-center lg:justify-end">
          <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-5 shadow-2xl backdrop-blur-sm h-[400px] flex flex-col justify-end">
            <div className="flex-1 flex flex-col gap-4 overflow-hidden mb-2">
              {SCRIPT.map((msg, idx) => {
                const isVisible = visibleLines > idx;
                if (!isVisible) return null;
                
                const isUser = msg.role === 'user';
                return (
                  <div key={idx} className={`flex animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`rounded-2xl px-4 py-3 text-sm font-mono whitespace-pre-wrap ${
                      isUser 
                        ? 'bg-violet-600/20 border border-violet-500/20 text-white/90' 
                        : 'bg-white/5 border border-white/10 text-white/70 max-w-[85%]'
                    }`}>
                      {msg.typing ? (
                        <div className="flex items-center gap-1 h-5">
                          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                        </div>
                      ) : msg.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
