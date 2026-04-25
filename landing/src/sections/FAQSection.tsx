import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'

export function FAQSection() {
  const faqs = [
    {
      q: "Do I need to know anything about crypto?",
      a: "No. Aegis abstracts away gas fees, networks, and seed phrases. You just talk to it like a normal assistant, and it handles the complex blockchain interactions in the background."
    },
    {
      q: "Can Aegis access my funds?",
      a: "No. Aegis is completely non-custodial. The session keys live only on your device, and they are scoped strictly to the limits you set. We cannot move your money without your explicit approval."
    },
    {
      q: "What happens if I lose my phone?",
      a: "Since your account is secured by Privy and linked to your primary login (like Google or Apple), you can simply log into Telegram on a new device, re-authenticate, and regain access to your smart account."
    },
    {
      q: "How does Aegis make money?",
      a: "We charge a small protocol fee on transactions and yield generated. This is entirely transparent and recorded on-chain. There are no hidden spreads or surprise charges."
    },
    {
      q: "What chains are supported?",
      a: "Aegis is currently live on Avalanche C-Chain. We are actively expanding to Base, Arbitrum, and other EVM-compatible networks."
    },
    {
      q: "Is my money insured?",
      a: "Funds deposited into yield strategies (like Aave) carry smart contract risk inherent to DeFi. While we only integrate with blue-chip, heavily audited protocols, there is no FDIC-style insurance in crypto."
    }
  ]

  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="py-24 px-6 bg-[#0f0f1a]">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold tracking-tight mb-12 text-center">Frequently Asked Questions</h2>
        
        <div className="space-y-4">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i
            return (
              <div 
                key={i} 
                className={clsx(
                  "border rounded-2xl transition-colors overflow-hidden",
                  isOpen ? "bg-white/5 border-white/10" : "border-white/5 hover:border-white/10 bg-transparent"
                )}
              >
                <button 
                  className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none hover:bg-white/[0.02] active:scale-[0.99] transition-all duration-200 cursor-pointer"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                >
                  <span className="font-medium text-white/90">{faq.q}</span>
                  <ChevronDown className={clsx(
                    "w-5 h-5 text-white/40 transition-transform duration-300",
                    isOpen && "rotate-180"
                  )} />
                </button>
                
                <div 
                  className={clsx(
                    "grid transition-all duration-300 ease-in-out",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-5 text-sm text-white/60 leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
