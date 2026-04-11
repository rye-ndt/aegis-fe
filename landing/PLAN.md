# Aegis Landing Page — Implementation Plan

## Overview

A public-facing marketing site for the Aegis protocol. Audience is split: traders who want to use the agent, and developers who want to publish tools and earn fees. The page lives at `mini-apps/landing/` as its own Vite app — no auth, no Privy, zero dependencies beyond React and Tailwind.

---

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 8 + `@vitejs/plugin-react` |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 (same `@tailwindcss/vite` plugin) |
| Routing | None — single page, anchor scroll |
| Animation | CSS keyframes + `IntersectionObserver` scroll reveals |
| Icons | Inline SVG only — no icon library dependency |
| Fonts | System stack — Inter via `font-sans` |

No external UI library, no component framework. Every component is handwritten to stay in full control of the visual.

---

## Design Language (from existing frontend)

Carry every token from the Aegis developer portal exactly:

```
Background:    #0f0f1a           (body, all sections)
Card surface:  bg-white/5        with border border-white/10
Primary:       violet-500 / #7c3aed  →  violet-600 / indigo-600 gradient
Status green:  emerald-400       (#34d399), with glow shadow
Text primary:  white
Text muted:    white/40 – white/60
Mono:          font-mono, text-xs, tracking-wide (for addresses, code)
Labels:        text-[10px] font-semibold tracking-widest uppercase white/30
Radius:        rounded-2xl (cards), rounded-3xl (hero blobs), rounded-xl (inputs)
Blur/glow:     blur-2xl, blur-3xl  on absolute pseudo-elements behind accents
CTA shadow:    shadow-[0_8px_32px_rgba(124,58,237,0.3)]
```

**Motion rules:**
- All reveals: `opacity-0 translate-y-6` → `opacity-100 translate-y-0`, `transition-all duration-700`
- Stagger children by `delay-[100ms]` increments
- Hover scale: `hover:scale-[1.02]` on cards, `hover:scale-[0.98]` active on buttons
- No layout shift animations — only opacity + translate

---

## File Structure

```
mini-apps/landing/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── index.css          ← identical to tool-creation/src/index.css
│   ├── App.tsx            ← composes all sections in order
│   ├── hooks/
│   │   └── useReveal.ts   ← IntersectionObserver scroll-trigger hook
│   └── sections/
│       ├── Navbar.tsx
│       ├── Hero.tsx
│       ├── Problem.tsx
│       ├── HowItWorks.tsx
│       ├── Features.tsx
│       ├── ForDevelopers.tsx
│       ├── Architecture.tsx
│       └── Footer.tsx
```

---

## Section-by-Section Spec

---

### Navbar

Fixed top bar. `position: fixed`, `backdrop-blur-md`, `bg-[#0f0f1a]/80`, `border-b border-white/5`.

Left: Shield SVG logo (the same violet gradient shield from `App.tsx`) + wordmark **Aegis** in `font-bold text-white`.

Center: Anchor links — `Features`, `For Developers`, `Architecture`. `text-sm text-white/50 hover:text-white/90 transition-colors`.

Right: Two buttons.
- `Open in Telegram` — ghost: `border border-white/10 text-white/70 hover:border-white/20 rounded-xl px-4 py-2 text-sm`
- `Build a Tool` — filled: `bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-4 py-2 text-sm shadow-[0_4px_16px_rgba(124,58,237,0.4)]`

On scroll past 60px: add `shadow-[0_1px_0_rgba(255,255,255,0.05)]` to the bar.

---

### Hero

Full viewport (`min-h-dvh`). Two-column layout on desktop, stacked on mobile.

**Left column (copy):**

```
Eyebrow label (tracking-widest, violet-400, uppercase, text-xs):
  "Intent-Based AI Agent · Avalanche"

H1 (text-5xl font-bold text-white leading-tight, desktop text-6xl):
  "Say what you want.
   We handle the chain."

Body (text-base text-white/50 max-w-md leading-relaxed, mt-4):
  "Aegis turns natural language into verified on-chain transactions —
   without ever touching your private key."

CTA row (mt-8, flex gap-3):
  [Open in Telegram]  ← primary violet button with glow
  [Read the Docs]     ← ghost button
```

**Right column (mockup):**

An animated terminal/chat widget. Dark glass card (`bg-white/5 border border-white/10 rounded-3xl p-5`). Shows a scripted conversation playing out on loop with a typewriter effect:

```
User:    "Swap 100 USDC for AVAX"
                                                  [typing indicator ...]
Agent:   "Pre-flight simulation passed.
          You send:  100 USDC
          You get:   ≈ 2.41 AVAX
          Gas:       sponsored
          
          Type /confirm to execute."
User:    "/confirm"
Agent:   "✓ Done. tx: 0xabc…def"
```

Each line fades in sequentially with 600ms delays. After the last line, pause 2.5s then fade all out and restart.

**Background:**
- Two large blurred orbs: one violet (`bg-violet-600/20 blur-[120px]`) top-left, one indigo (`bg-indigo-600/15 blur-[100px]`) bottom-right. `position: absolute`, `pointer-events-none`.
- Subtle grid pattern overlay: `bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]` on a `position: absolute inset-0` div.

---

### Problem

`id="features"`. Three cards in a row. Section padding `py-32`. Centered header first:

```
Label:    "The Problem"
H2:       "DeFi is broken for everyone."
Subhead:  "Three failure modes that Aegis solves."
```

Cards (`bg-white/5 border border-white/8 rounded-2xl p-6 hover:border-white/20 transition-all`):

| # | Icon | Title | Copy |
|---|---|---|---|
| 1 | Warning triangle (amber) | "UX That Locks People Out" | "Complex UIs, manual calldata, seed phrase anxiety. 99% of users stop at the interface." |
| 2 | Key (red) | "The Private Key Trap" | "Existing Telegram bots ask for your private key. One breach empties every wallet they hold." |
| 3 | Lock (slate) | "Monolithic, Closed Bots" | "Today's bots only support what their team built. No community, no composability, no ecosystem." |

Each card has a small icon in a colored glass chip at the top, then title in `font-semibold text-white`, then body in `text-sm text-white/50`.

Scroll-reveal: stagger the three cards `delay-[0ms]`, `delay-[150ms]`, `delay-[300ms]`.

---

### HowItWorks

Alternating full-bleed section (slightly different bg: `bg-white/[0.02]`). Section padding `py-32`.

```
Label:    "How It Works"
H2:       "From intent to on-chain, in seconds."
```

Vertical step list — 5 steps. Each step is a row: step number pill (left) + content card (right) connected by a vertical dotted line between steps.

| Step | Title | Body |
|---|---|---|
| 01 | **You describe what you want** | "Type 'Swap 100 USDC for AVAX on Pangolin' — plain English, no menus." |
| 02 | **The AI parses your intent** | "Claude extracts the action, tokens, amounts, and slippage. Confidence below 70%? It asks you to clarify." |
| 03 | **The right tool is selected** | "Aegis searches a registry of community-published Tool Manifests and picks the best match for your intent and chain." |
| 04 | **Pre-flight simulation** | "The calldata is simulated via eth_call before anything is signed. Token deltas are shown. If the simulation fails, execution stops — no gas burned." |
| 05 | **You confirm, it executes** | "Your ERC-4337 Smart Account executes via a scoped Session Key. You never touch a private key." |

Step number pill: `text-[10px] font-bold tracking-widest text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full w-8 h-8 flex items-center justify-center`.

Content card: glass card with violet left-border accent (`border-l-2 border-violet-500`).

Scroll-reveal each step sequentially as user scrolls.

---

### Features

`id="features"`. Six-card grid (3×2 desktop, 2×3 tablet, 1 mobile). Section `py-32`.

```
Label:    "Built Different"
H2:       "Security and openness, not a trade-off."
```

| Icon | Title | Body |
|---|---|---|
| Shield (violet) | **Non-Custodial by Design** | "ERC-4337 Smart Accounts. Session Keys with scoped permissions. The bot never holds your master key." |
| Flask (emerald) | **Pre-Flight Simulator** | "Every transaction is simulated before signing. You see exact token deltas before committing." |
| Cpu (indigo) | **Natural Language Interface** | "Powered by Claude. No menus, no forms — describe what you want and the agent figures out the rest." |
| Database (amber) | **Verified Token Registry** | "Symbol → address mapping with chain filters. No token spoofing, no fake contract attacks." |
| Puzzle (violet) | **Community Tool Registry** | "Third-party developers publish Tool Manifests. Any protocol can integrate — no gatekeeping." |
| Coins (emerald) | **On-Chain Fee Sharing** | "Every tool execution routes a revenue share to its contributor. Build once, earn on every use." |

Card layout: icon in colored glass chip, then `font-semibold text-white text-sm` title, then `text-xs text-white/50 mt-2 leading-relaxed` body.

Hover state: `hover:bg-white/8 hover:border-white/20` + `hover:-translate-y-1`. Transition `duration-200`.

---

### ForDevelopers

`id="developers"`. Split layout — copy left, code right. Section `py-32`.

**Left (copy):**

```
Label (violet):    "For Developers"
H2:                "Publish a tool.
                    Earn on every execution."
Body:              "Write a Tool Manifest — a JSON document describing
                    what your protocol does and how to call it. The agent
                    discovers it automatically. Every time a user's intent
                    matches your tool, your revenue wallet receives a
                    protocol fee share."
```

Three feature bullets (icon + text):
- `→` Publish via REST API or the Developer Portal
- `→` Fee revenue to your wallet, on-chain and automatic
- `→` No approval process — register and go live instantly

CTA button: `Start Building →` links to the Developer Portal.

**Right (code panel):**

A dark glass card (`bg-[#0a0a14] border border-white/10 rounded-2xl`) showing a syntax-highlighted JSON snippet of a minimal Tool Manifest. Use `<pre><code>` with manual span-based highlighting (violet for keys, emerald for strings, amber for numbers). Keep it to ~25 lines — trim to the identity + one step.

```json
{
  "toolId": "pangolin-swap-v2",
  "category": "swap",
  "name": "Pangolin V2 Swap",
  "description": "Swap tokens on Pangolin DEX on Avalanche.",
  "tags": ["swap", "dex", "avax"],
  "chainIds": [43113],
  "steps": [
    {
      "kind": "http_get",
      "name": "getQuote",
      "url": "https://api.pangolin.exchange/v2/quote?...",
      "extract": {
        "calldata": "$.tx.data",
        "to": "$.tx.to"
      }
    }
  ]
}
```

A small glowing dot pulses in the top-left of the code card: `bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse` — visual cue that the tool is "live."

Background on this section: single large violet orb `bg-violet-600/10 blur-[160px]` behind the right column.

---

### Architecture

`id="architecture"`. Full-width section, `py-32`, centered content `max-w-4xl mx-auto`.

```
Label:    "Protocol Architecture"
H2:       "Four layers. One seamless experience."
```

A layered diagram built from HTML/CSS — no canvas, no SVG chart library. Four horizontal "layer bars" stacked vertically, connected by vertical flow arrows.

Each layer is a wide card (`w-full rounded-2xl border border-white/10 bg-white/5 px-8 py-5`):

```
┌─────────────────────────────────────────┐
│  🧠  Intelligence Layer                  │
│      Intent Parser · Semantic Router     │
│      Token Registry · LLM (Claude)       │
└─────────────────────────────────────────┘
              ↓  (vertical dotted line)
┌─────────────────────────────────────────┐
│  ⚙️   Execution Layer                    │
│      Solver Engine · Tool Manifests      │
│      Pre-Flight Simulator                │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  🔗  On-Chain Layer                      │
│      ERC-4337 SCA · Session Keys         │
│      Paymaster · Fee Splitter            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  💬  Interface Layer                     │
│      Telegram Agent · Developer Portal   │
│      Result Parser                       │
└─────────────────────────────────────────┘
```

Each layer card has: a left-side colored accent line (violet, indigo, emerald, amber respectively), layer name in `font-semibold text-white`, and component chips (small `rounded-full bg-white/8 border border-white/10 px-3 py-1 text-xs text-white/60`).

Flow arrows: a centered `w-px h-8 bg-gradient-to-b from-white/20 to-transparent` bar between each card.

Scroll-reveal: each layer slides in from left with increasing delay.

---

### Footer

Dark, minimal. `bg-[#080810] border-t border-white/5 py-16`.

Layout: three columns.

**Left:** Shield logo + wordmark. Tagline: `"Intent-based AI trading on Avalanche."` in `text-xs text-white/30`. Below: `text-[10px] text-white/20` contract addresses (AegisToken proxy, EntryPoint).

**Center:** Link groups.
- Protocol: Features, Architecture, Docs
- Developers: Developer Portal, Tool Manifest Spec, API Reference

**Right:** Social/ecosystem links.
- Telegram Bot (main CTA)
- GitHub (if public)
- Avalanche Fuji Explorer (link to EntryPoint contract)

Bottom bar: `border-t border-white/5 mt-12 pt-6 flex justify-between text-[10px] text-white/20`.
- Left: `© 2026 Aegis Protocol`
- Right: `Built on Avalanche · Powered by Claude`

---

## useReveal Hook

Shared hook used by every section to trigger scroll animations:

```ts
// src/hooks/useReveal.ts
import { useEffect, useRef, useState } from "react";

export function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}
```

Usage pattern in every section:
```tsx
const { ref, visible } = useReveal();
<section ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
```

---

## Hero Terminal Animation

```ts
// Driven by a useEffect in Hero.tsx
const SCRIPT = [
  { role: "user",  text: "Swap 100 USDC for AVAX" },
  { role: "agent", text: "Simulating...", typing: true },
  { role: "agent", text: "Pre-flight passed ✓\nYou send:  100 USDC\nYou get:   ≈ 2.41 AVAX\nGas:       sponsored\n\nType /confirm to execute." },
  { role: "user",  text: "/confirm" },
  { role: "agent", text: "Done. tx: 0xabc…def ✓" },
];
```

State: `visibleLines: number` incremented by `setTimeout` chain. Each line appears with a fade-in. After all lines visible, 2500ms pause then `setVisibleLines(0)` to restart.

User messages align right (`justify-end`). Agent messages align left. User bubble: `bg-violet-600/20 border border-violet-500/20`. Agent bubble: `bg-white/5 border border-white/10`. Both `rounded-2xl px-4 py-3 text-sm font-mono`.

---

## Dependencies (package.json)

```json
{
  "name": "aegis-landing",
  "dependencies": {
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.2.2",
    "@vitejs/plugin-react": "^6.0.1",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "tailwindcss": "^4.2.2",
    "typescript": "~6.0.2",
    "vite": "^8.0.4"
  }
}
```

Zero runtime dependencies beyond React. No router (single page, anchor scroll), no icon library, no animation library.

---

## Responsive Breakpoints

| Breakpoint | Layout change |
|---|---|
| `< 768px` (mobile) | All sections stack; hero terminal hidden; 1-col grids |
| `768px–1024px` (tablet) | 2-col feature grid; hero stacked; code panel full-width |
| `> 1024px` (desktop) | Full 2-col hero; 3-col feature grid; side-by-side ForDevelopers |

Navbar: below `768px` → hide center nav links; keep logo + "Open in Telegram" button only.

---

## Build Order

Build in this sequence — each step is independently reviewable:

1. `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/index.css`, `src/main.tsx`
2. `useReveal` hook
3. `Navbar` — static, no state
4. `Footer` — static
5. `Hero` — most complex; build terminal animation last
6. `Problem` — three static cards
7. `Features` — six static cards
8. `HowItWorks` — step list with connectors
9. `ForDevelopers` — split layout + code panel
10. `Architecture` — layered diagram
11. Wire all sections into `App.tsx`
12. Responsive pass — mobile, tablet, desktop
13. Polish pass — animation timing, glow intensities, hover states
