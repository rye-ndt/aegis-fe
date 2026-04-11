import { useState, useEffect } from 'react';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 w-full z-50 backdrop-blur-md bg-[#0f0f1a]/80 border-b border-white/5 transition-shadow duration-300 ${scrolled ? 'shadow-[0_1px_0_rgba(255,255,255,0.05)]' : ''}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="origin-center">
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z" fill="url(#nav-shield-gradient)" />
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="nav-shield-gradient" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7c3aed" />
                <stop offset="1" stopColor="#4f46e5" />
              </linearGradient>
            </defs>
          </svg>
          <span className="font-bold text-white tracking-wide text-lg">Aegis</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-white/50 hover:text-white/90 transition-colors">Features</a>
          <a href="#developers" className="text-sm text-white/50 hover:text-white/90 transition-colors">For Developers</a>
          <a href="#architecture" className="text-sm text-white/50 hover:text-white/90 transition-colors">Architecture</a>
        </div>

        <div className="flex items-center gap-3">
          <a href="#" className="border border-white/10 text-white/70 hover:border-white/20 rounded-xl px-4 py-2 text-sm transition-colors">Open in Telegram</a>
          <a href="#developers" className="hidden md:inline-flex bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-4 py-2 text-sm shadow-[0_4px_16px_rgba(124,58,237,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all">Build a Tool</a>
        </div>
      </div>
    </nav>
  );
}
