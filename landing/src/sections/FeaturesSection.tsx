import { Send, Repeat, PiggyBank, BarChart3, Settings, Gift, Smartphone, Layers } from 'lucide-react'

export function FeaturesSection() {
  const features = [
    { icon: <Send />, title: "Send by username", desc: "No long 0x addresses." },
    { icon: <Repeat />, title: "Swap any token", desc: "Cross-chain routing." },
    { icon: <PiggyBank />, title: "Auto-yield", desc: "Put idle cash to work." },
    { icon: <BarChart3 />, title: "Daily PnL report", desc: "Know exactly where you stand." },
    { icon: <Settings />, title: "Spending limits", desc: "You control the thresholds." },
    { icon: <Gift />, title: "Loyalty rewards", desc: "Earn points on every action." },
    { icon: <Smartphone />, title: "Telegram-native", desc: "Nothing to install." },
    { icon: <Layers />, title: "Live on Avalanche", desc: "More chains coming soon." }
  ]

  return (
    <section className="py-24 px-6 border-t border-white/5 bg-white/[0.02]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Everything you need, <br/>nothing you don't.</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {features.map((feature, i) => (
            <div key={i} className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10 active:scale-[0.98] cursor-pointer transition-all duration-200 flex flex-col gap-3 group">
              <div className="text-white/40 group-hover:text-violet-400 transition-colors w-8 h-8">
                {feature.icon}
              </div>
              <h4 className="font-semibold text-white/90">{feature.title}</h4>
              <p className="text-sm text-white/40">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
