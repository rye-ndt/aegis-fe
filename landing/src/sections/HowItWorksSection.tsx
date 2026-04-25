export function HowItWorksSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-16">Three steps to your smart account.</h2>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          
          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-violet-600 flex items-center justify-center text-xl font-bold shadow-[0_0_20px_rgba(124,58,237,0.5)]">1</div>
            <h4 className="font-semibold text-lg">Open the Bot</h4>
            <p className="text-sm text-white/50 text-center px-4">Start a chat with Aegis on Telegram. No apps to download.</p>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#1c1c28] border border-white/20 flex items-center justify-center text-xl font-bold text-white/80">2</div>
            <h4 className="font-semibold text-lg">One-Tap Create</h4>
            <p className="text-sm text-white/50 text-center px-4">Create an account with FaceID/TouchID. No seed phrases to store.</p>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#1c1c28] border border-white/20 flex items-center justify-center text-xl font-bold text-white/80">3</div>
            <h4 className="font-semibold text-lg">Tell it what you want</h4>
            <p className="text-sm text-white/50 text-center px-4">Speak in plain English. The Intent Layer translates your words into on-chain action.</p>
          </div>
        </div>

        <div className="mt-20 inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm text-white/60">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-400" /> Telegram
          </span>
          <span className="text-white/20">→</span>
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-400" /> Intent Layer
          </span>
          <span className="text-white/20">→</span>
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" /> Smart Account
          </span>
        </div>
        <p className="mt-4 text-xs text-white/30">Powered by ERC-4337 account abstraction.</p>

      </div>
    </section>
  )
}
