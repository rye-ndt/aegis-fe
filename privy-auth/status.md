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
- **Telegram Auto-Login**: Silent, zero-click authentication when opening inside a Telegram Mini App WebView. `TelegramAutoLogin` reads `initDataRaw` from `@tma.js/sdk-react` and calls `loginWithTelegram(initDataRaw)` on mount. Falls back gracefully to the Google OAuth button in non-TMA contexts. Removed the legacy `sendData` relay (superseded by the existing `POST /auth/privy` HTTP call). Loading spinner suppresses `LoginView` flicker during the auto-login window.
- **Session Keypair (`useDelegatedKey`)**: Generates an ECDSA keypair on first use, installs it as a ZeroDev permission plugin on the user's Kernel smart account (sudo policy), encrypts the serialized blob with AES-GCM + PBKDF2 into Telegram CloudStorage. Exposes `keypairRef`, `keypairAddress`, `updateBlob` for downstream hooks.
- **Aegis Guard**: Toggle + modal that lets users grant per-token ERC20 cumulative spending limits to their existing session keypair. Calls `installSessionKeyWithErc20Limits` (`toCallPolicy` with `ParamCondition.LESS_THAN_OR_EQUAL` per token, gas sponsored via ZeroDev paymaster). On confirm: installs the scoped session key on-chain, re-encrypts the new serialized blob into CloudStorage, posts the delegation grant to `POST /aegis-guard/grant`, and sets the preference via `POST /preference`. Toggle reads initial state from `GET /preference` on mount. Disable is soft (preference flag only; on-chain permission expires at its own `validUntil`). Toggle is disabled with a tooltip when no session keypair exists yet.

## Environment Variables

| Variable | Purpose |
| -------- | ------- |
| `VITE_PRIVY_APP_ID` | Privy application ID |
| `VITE_BACKEND_URL` | Backend HTTP API base URL |
| `VITE_ZERODEV_RPC` | ZeroDev bundler RPC — used for `publicClient` in session key installation |
| `VITE_PAYMASTER_URL` | ZeroDev/Pimlico paymaster RPC — used for gas sponsorship in `installSessionKeyWithErc20Limits` |

## Key Files

| File | Purpose |
| ---- | ------- |
| `src/utils/crypto.ts` | `generateKeypair`, `installSessionKey` (sudo), `installSessionKeyWithErc20Limits` (ERC20-scoped + paymaster), `createSessionKeyClient`, AES-GCM encrypt/decrypt |
| `src/hooks/useDelegatedKey.ts` | Session keypair lifecycle: create → install on-chain → encrypt to CloudStorage → unlock; exposes `keypairRef`, `keypairAddress`, `updateBlob` |
| `src/hooks/useAegisGuard.ts` | Aegis Guard state machine; accepts `{ keypairRef, keypairAddress, scaAddress, updateBlob }` from caller; exposes `grant`, `disable`, `openModal`, `closeModal` |
| `src/components/AegisGuardModal.tsx` | Fetches portfolio on mount; per-token limit + date inputs; validates before enabling confirm |
| `src/components/AegisGuardToggle.tsx` | Toggle switch; disabled with tooltip when session keypair not set up |
| `src/App.tsx` | Wires `useDelegatedKey` → `useAegisGuard`; renders toggle and modal in `ConnectedView` |
