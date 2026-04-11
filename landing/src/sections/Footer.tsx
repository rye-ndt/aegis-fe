export function Footer() {
  return (
    <footer className="bg-[#080810] border-t border-white/5 py-16">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z" fill="url(#footer-shield-gradient)" />
              <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="footer-shield-gradient" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7c3aed" />
                  <stop offset="1" stopColor="#4f46e5" />
                </linearGradient>
              </defs>
            </svg>
            <span className="font-bold text-white tracking-wide">Aegis</span>
          </div>
          <p className="text-xs text-white/30 mb-6">Intent-based AI trading on Avalanche.</p>
          <div className="flex flex-col gap-1 text-[10px] text-white/20 font-mono">
            <span>AegisToken Proxy: 0xabc...def</span>
            <span>EntryPoint: 0x123...456</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-12 md:col-span-1 justify-start md:justify-center">
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-white/90 mb-2">Protocol</h4>
            <a href="#features" className="text-sm text-white/50 hover:text-white transition-colors">Features</a>
            <a href="#architecture" className="text-sm text-white/50 hover:text-white transition-colors">Architecture</a>
            <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">Docs</a>
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-white/90 mb-2">Developers</h4>
            <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">Developer Portal</a>
            <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">Tool Manifest Spec</a>
            <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">API Reference</a>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <h4 className="text-sm font-semibold text-white/90 mb-2">Ecosystem</h4>
          <a href="#" className="text-sm text-violet-400 hover:text-violet-300 transition-colors">Telegram Bot ↗</a>
          <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">GitHub</a>
          <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">Avalanche Fuji Explorer</a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-12 pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-white/20">
        <span>© 2026 Aegis Protocol</span>
        <span>Built on Avalanche · Powered by Claude</span>
      </div>
    </footer>
  );
}
