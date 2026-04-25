import { Shield, ArrowRight, MessageCircle, Code2, Send } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-white/5 pt-24 pb-12 px-6 bg-[#0a0a14]">
      <div className="max-w-5xl mx-auto flex flex-col items-center">
        
        {/* Final CTA */}
        <div className="text-center mb-24 max-w-2xl">
          <h2 className="text-4xl font-bold tracking-tight mb-6">Ready to upgrade your account?</h2>
          <a href="https://t.me/AegisWalletBot" target="_blank" rel="noreferrer" className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white text-gray-900 font-semibold text-lg hover:bg-white/90 active:scale-95 transition-all duration-200 shadow-[0_8px_32px_rgba(124,58,237,0.3)] hover:shadow-[0_8px_40px_rgba(124,58,237,0.45)] hover:-translate-y-0.5 flex items-center justify-center gap-2 mx-auto">
            Open in Telegram
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>

        {/* Footer Links */}
        <div className="w-full grid grid-cols-2 md:grid-cols-5 gap-8 mb-16">
          <div className="col-span-2 md:col-span-2">
            <div className="inline-flex items-center gap-2 mb-6 cursor-pointer hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="Aegis Logo" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling!.classList.remove('hidden'); }} />
              <Shield className="w-5 h-5 text-violet-400 hidden" />
              <span className="text-lg font-bold text-white tracking-tight">Aegis</span>
            </div>
            <p className="text-sm text-white/50 max-w-xs mb-6">
              The smart on-chain account built natively into Telegram. Powered by account abstraction and verifiable intents.
            </p>
            <div className="flex items-center gap-4 text-white/40">
              <a href="mailto:aegis.helper@gmail.com" className="hover:text-white hover:scale-110 transition-all cursor-pointer"><MessageCircle className="w-5 h-5" /></a>
              <a href="https://github.com/rye-ndt" target="_blank" rel="noreferrer" className="hover:text-white hover:scale-110 transition-all cursor-pointer"><Code2 className="w-5 h-5" /></a>
              <a href="https://t.me/AegisWalletBot" target="_blank" rel="noreferrer" className="hover:text-white hover:scale-110 transition-all cursor-pointer"><Send className="w-5 h-5" /></a>
            </div>
          </div>

          <div>
            <h5 className="font-semibold text-white mb-4">Product</h5>
            <ul className="space-y-3 text-sm text-white/50">
              <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Aegis Guard</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Yield</a></li>
            </ul>
          </div>

          <div>
            <h5 className="font-semibold text-white mb-4">Developers</h5>
            <ul className="space-y-3 text-sm text-white/50">
              <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Capabilities API</a></li>
              <li><a href="#" className="hover:text-white transition-colors">GitHub</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
            </ul>
          </div>

          <div>
            <h5 className="font-semibold text-white mb-4">Company</h5>
            <ul className="space-y-3 text-sm text-white/50">
              <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Press Kit</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="w-full pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <div>© 2026 Aegis. All rights reserved.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Security Disclosure</a>
          </div>
        </div>

      </div>
    </footer>
  )
}
