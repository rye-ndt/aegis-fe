import { useReveal } from '../hooks/useReveal';

export function ForDevelopers() {
  const { ref, visible } = useReveal();

  return (
    <section id="developers" ref={ref} className={`py-32 px-6 max-w-7xl mx-auto overflow-hidden transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        
        <div className="flex flex-col">
          <span className="text-[10px] tracking-widest text-violet-400 uppercase font-semibold mb-3 block">
            For Developers
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
            Publish a tool.<br/>Earn on every execution.
          </h2>
          <p className="text-base text-white/50 leading-relaxed mb-8 max-w-lg">
            Write a Tool Manifest — a JSON document describing what your protocol does and how to call it. The agent discovers it automatically. Every time a user's intent matches your tool, your revenue wallet receives a protocol fee share.
          </p>
          
          <ul className="flex flex-col gap-4 mb-10">
            <li className="flex items-center gap-3 text-sm text-white/70">
              <span className="text-violet-500 font-bold">→</span> Publish via REST API or the Developer Portal
            </li>
            <li className="flex items-center gap-3 text-sm text-white/70">
              <span className="text-violet-500 font-bold">→</span> Fee revenue to your wallet, on-chain and automatic
            </li>
            <li className="flex items-center gap-3 text-sm text-white/70">
              <span className="text-violet-500 font-bold">→</span> No approval process — register and go live instantly
            </li>
          </ul>

          <div>
            <a href="#" className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-white/10 hover:bg-white/15 px-6 py-3 rounded-xl transition-all">
              Start Building <span className="text-violet-400">→</span>
            </a>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 bg-violet-600/10 blur-[160px] pointer-events-none rounded-full" />
          
          <div className="relative bg-[#0a0a14] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-x-auto w-full">
            <div className="absolute top-4 right-4 w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_8px_#34d399] animate-pulse" />
            <pre className="text-[13px] leading-[1.6] font-mono text-white/70">
<code>{`{
  `}</code><span className="text-violet-400">"toolId"</span><code>{`: `}</code><span className="text-emerald-400">"pangolin-swap-v2"</span><code>{`,
  `}</code><span className="text-violet-400">"category"</span><code>{`: `}</code><span className="text-emerald-400">"swap"</span><code>{`,
  `}</code><span className="text-violet-400">"name"</span><code>{`: `}</code><span className="text-emerald-400">"Pangolin V2 Swap"</span><code>{`,
  `}</code><span className="text-violet-400">"description"</span><code>{`: `}</code><span className="text-emerald-400">"Swap tokens on Pangolin DEX."</span><code>{`,
  `}</code><span className="text-violet-400">"tags"</span><code>{`: [`}</code><span className="text-emerald-400">"swap"</span><code>{`, `}</code><span className="text-emerald-400">"dex"</span><code>{`],
  `}</code><span className="text-violet-400">"chainIds"</span><code>{`: [`}</code><span className="text-amber-400">43113</span><code>{`],
  `}</code><span className="text-violet-400">"steps"</span><code>{`: [
    {
      `}</code><span className="text-violet-400">"kind"</span><code>{`: `}</code><span className="text-emerald-400">"http_get"</span><code>{`,
      `}</code><span className="text-violet-400">"name"</span><code>{`: `}</code><span className="text-emerald-400">"getQuote"</span><code>{`,
      `}</code><span className="text-violet-400">"url"</span><code>{`: `}</code><span className="text-emerald-400">"https://api.pangolin.exchange/v2/..."</span><code>{`,
      `}</code><span className="text-violet-400">"extract"</span><code>{`: {
        `}</code><span className="text-violet-400">"calldata"</span><code>{`: `}</code><span className="text-emerald-400">"$.tx.data"</span><code>{`,
        `}</code><span className="text-violet-400">"to"</span><code>{`: `}</code><span className="text-emerald-400">"$.tx.to"</span><code>{`
      }
    }
  ]
}`}</code>
            </pre>
          </div>
        </div>

      </div>
    </section>
  );
}
