import { Frown, Unlock, TrendingDown } from 'lucide-react'

export function ProblemSection() {
  const problems = [
    {
      icon: <Frown className="w-6 h-6 text-pink-400" />,
      title: "Crypto apps are confusing.",
      description: "Seed phrases, gas fees, networks, RPCs. Most people give up before making their first transaction."
    },
    {
      icon: <Unlock className="w-6 h-6 text-orange-400" />,
      title: "Bots ask for your private key.",
      description: "Trading bots on Telegram force you to surrender your keys, putting your entire portfolio at risk."
    },
    {
      icon: <TrendingDown className="w-6 h-6 text-blue-400" />,
      title: "Your stablecoins sit idle.",
      description: "While inflation eats your cash, safe DeFi yield is too complex and time-consuming to access."
    }
  ]

  return (
    <section className="py-24 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          {problems.map((problem, i) => (
            <div key={i} className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm flex flex-col gap-4 cursor-pointer hover:bg-white/10 active:scale-[0.98] transition-all duration-200">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                {problem.icon}
              </div>
              <h3 className="text-xl font-semibold text-white/90">{problem.title}</h3>
              <p className="text-white/50 leading-relaxed">
                {problem.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
