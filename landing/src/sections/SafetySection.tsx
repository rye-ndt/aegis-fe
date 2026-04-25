import { Key, ShieldAlert, CheckCircle2 } from 'lucide-react'

export function SafetySection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-4xl font-bold tracking-tight mb-4">How it stays <span className="text-green-400">safe.</span></h2>
        <p className="text-xl text-white/50 mb-16 max-w-2xl mx-auto">
          Security isn't a feature, it's the foundation. We built Aegis so you never have to compromise between convenience and safety.
        </p>

        <div className="grid md:grid-cols-3 gap-8 text-left mb-16">
          <div className="space-y-4 p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/5 active:scale-[0.98] cursor-pointer transition-all duration-200">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
              <Key className="w-5 h-5" />
            </div>
            <h4 className="text-lg font-semibold text-white">You hold the keys</h4>
            <p className="text-sm text-white/50 leading-relaxed">
              Session keys live securely on your device. Aegis can never move funds you didn't explicitly approve.
            </p>
          </div>
          
          <div className="space-y-4 p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/5 active:scale-[0.98] cursor-pointer transition-all duration-200">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h4 className="text-lg font-semibold text-white">Aegis Guard</h4>
            <p className="text-sm text-white/50 leading-relaxed">
              Set spending limits. "Only allow swaps up to $100 for 7 days" — enforced on-chain, not just in software.
            </p>
          </div>

          <div className="space-y-4 p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/5 active:scale-[0.98] cursor-pointer transition-all duration-200">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h4 className="text-lg font-semibold text-white">Verified Registry</h4>
            <p className="text-sm text-white/50 leading-relaxed">
              No spoofed tokens. No scam approvals. Aegis only interacts with a curated registry of verified smart contracts.
            </p>
          </div>
        </div>

        {/* Comparison Banner */}
        <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-red-500/10 via-transparent to-green-500/10 border border-white/10 flex flex-col md:flex-row items-center gap-6 text-left">
          <div className="flex-1">
            <h5 className="font-semibold text-white mb-2">How is this different from standard Telegram bots?</h5>
            <p className="text-sm text-white/60">
              Other bots ask for your seed phrase, meaning they have total control over your money. If they get hacked, you lose everything. With Aegis account abstraction, you sign a temporary session key that cannot drain your wallet.
            </p>
          </div>
          <div className="hidden md:block w-px h-16 bg-white/10" />
          <div className="text-sm font-medium text-green-400 shrink-0">
            It's the killer differentiator.
          </div>
        </div>

      </div>
    </section>
  )
}
