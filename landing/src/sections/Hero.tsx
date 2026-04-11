import { useState, useEffect } from 'react';
import { useReveal } from '../hooks/useReveal';

const SCRIPT = [
  { role: "user",  text: "Bridge 500 USDC to Avalanche and swap for JOE using community tools." },
  { role: "agent", text: "Accessing Community Toolkit...", typing: true },
  { role: "agent", text: "Found best path:\n1. Bridge via @StargateTool\n2. Swap via @TraderJoeTool\n\nYou send: 500 USDC\nYou get:  ≈ 800 JOE\nGas:      sponsored\n\nType /confirm." },
  { role: "user",  text: "/confirm" },
  { role: "agent", text: "Executing secure delegation... ✓\nDone. tx: 0xabc…def" },
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
          <span className="text-[10px] tracking-widest text-amber-400 uppercase font-semibold mb-6 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">
            The First Community-Driven, Extendable Intent-Based Wallet
          </span>
          <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight mb-4">
            Non-Custodial.<br/>Zero Blockchain Knowledge.<br/>Zero Hallucination.
          </h1>
          <p className="text-base text-white/50 max-w-md leading-relaxed mb-8">
            Our robust new delegation standard ensures agents manage your intents flawlessly, without ever compromising your funds or private keys.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* User Card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors flex flex-col justify-between shadow-[0_4px_24px_rgba(124,58,237,0.1)] hover:shadow-[0_4px_32px_rgba(124,58,237,0.2)]">
              <div>
                <h3 className="text-white font-semibold mb-2">Why install another wallet when you have Telegram?</h3>
                <p className="text-sm text-white/50 mb-6">Experience the fastest onboarding in Web3.</p>
              </div>
              <div>
                <a href="https://t.me/" target="_blank" rel="noreferrer" className="flex items-center justify-center w-full bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-4 py-3 text-sm shadow-[0_8px_32px_rgba(124,58,237,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all mb-4">
                  Open in Telegram
                </a>
                <div className="flex items-center gap-2 text-xs text-white/40 justify-center group opacity-70">
                  <svg className="w-4 h-4 grayscale opacity-50" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.25c-5.38 0-9.75 4.37-9.75 9.75s4.37 9.75 9.75 9.75 9.75-4.37 9.75-9.75S17.38 2.25 12 2.25Zm0 1.5c1.6 0 3.08.49 4.34 1.33h-8.68A8.23 8.23 0 0 1 12 3.75Zm-5.36 2.37h6.6L8.5 14.3a8.2 8.2 0 0 1-1.86-8.18Zm-1.83 5.88c0-3.37 2.05-6.27 4.96-7.5l4.74 8.19-2.9 5.03c-3.87-1.1-6.8-4.05-6.8-5.72Zm7.19-2.25c1.24 0 2.25 1.01 2.25 2.25s-1.01 2.25-2.25 2.25-2.25-1.01-2.25-2.25 1.01-2.25 2.25-2.25Zm1.24 7.23-2.9-5.02h5.8c-1.39 3.04-4.52 5.02-8.08 5.02-.95 0-1.87-.16-2.73-.44l4.74-8.2h5.08a8.21 8.21 0 0 1-1.91 8.64Z"/>
                  </svg>
                  <span>Chrome Extension (Coming Soon)</span>
                </div>
              </div>
            </div>

            {/* Developer Card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors flex flex-col justify-between shadow-[0_4px_24px_rgba(16,185,129,0.1)] hover:shadow-[0_4px_32px_rgba(16,185,129,0.2)]">
              <div>
                <h3 className="text-white font-semibold mb-2">If you are a developer and know JSON, join us.</h3>
                <p className="text-sm text-emerald-400/80 mb-6">We share our revenue with you when users use your tools.</p>
              </div>
              <a href="#developers" className="flex items-center justify-center w-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/30 rounded-xl px-4 py-3 text-sm hover:scale-[1.02] active:scale-[0.98] transition-all">
                Start Building
              </a>
            </div>
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
