# Privy Auth Mini-App — Status Log

## Overview
A boilerplate wrapper and authentication proxy originally engineered for embedding into Telegram Mini Apps. Focuses on orchestrating seamless Web3 onboarding via social logins and invisible smart accounts.

## Technical Stack
- **Framework**: React 19 / Vite 8 / TypeScript
- **Auth & Wallet**: Privy v3 SDK (`@privy-io/react-auth`) + Smart Wallets Provider
- **Styling**: Tailwind CSS v4

## Implemented Features
- **Telegram Mini App UI Configuration**: Manages viewport sealing `user-scalable=no` while interpreting safe-area insets mapping strictly to Telegram window constraints.
- **1-Click Google OAuth**: Registration strictly via Privy's proxy default application requiring zero external key configuration.
- **Embedded EOA Pipeline**: Automatically provisions an embedded Ethereum wallet inside a secure enclave upon validation without seed-phrase exposure.
- **ERC-4337 Smart Wallets**: Exposes `useSmartWallets` providing a lazy-deployed deterministically seeded smart contract account acting on behalf of the generated EOA signer.
- **Session State Hydration**: Smooth UI gating evaluating `usePrivy().ready` restricting layouts directly preventing authentication flickering dynamically.
