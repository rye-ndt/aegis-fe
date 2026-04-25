import { Code2 } from 'lucide-react'

export function TechSecuritySection() {
  const stack = ["ERC-4337", "ZeroDev", "Avalanche", "Aave v3", "Relay", "Privy"]
  
  return (
    <section className="py-12 px-6 border-b border-white/5 bg-[#0f0f1a]">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
        
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-white/40 uppercase tracking-widest mb-4">Powered By</h4>
          <div className="flex flex-wrap gap-2">
            {stack.map((tech, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">
                {tech}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-8 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-white/40 uppercase tracking-widest text-xs">Security</span>
            <span className="text-white/80 font-medium">Audit in progress</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col gap-1">
            <span className="text-white/40 uppercase tracking-widest text-xs">System</span>
            <span className="text-green-400 font-medium flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> All systems operational
            </span>
          </div>
          <div className="w-px h-8 bg-white/10 hidden sm:block" />
          <a href="#" className="hidden sm:flex items-center gap-2 text-white/60 hover:text-white transition-colors">
            <Code2 className="w-4 h-4" />
            <span>Open Source</span>
          </a>
        </div>

      </div>
    </section>
  )
}
