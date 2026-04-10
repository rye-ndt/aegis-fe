# privy-auth — Feature Status

## Stack
Vite 8 + React 19 + TypeScript + Tailwind CSS v4 + Privy v3

---

## Features

### Telegram Mini App integration
`index.html` loads `telegram-web-app.js` from Telegram's CDN. On boot, `main.tsx` calls `WebApp.ready()`, `WebApp.expand()`, and sets the header/background color to match the app's dark theme. The viewport has `user-scalable=no` and respects safe-area insets so content doesn't clip under Telegram's chrome.

### Google login via Privy
`PrivyProvider` is configured with `loginMethods: ['google']`. Clicking "Continue with Google" calls `usePrivy().login()`, which opens Privy's OAuth popup. No Google Cloud credentials needed — Privy's default OAuth app handles it out of the box.

### Embedded wallet (EOA) auto-creation
`embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'` tells Privy to silently generate an Ethereum embedded wallet for any user who doesn't already have one, immediately after Google login completes. The key is stored in Privy's secure enclave — the user never sees a seed phrase.

### Smart wallet (ERC-4337)
`SmartWalletsProvider` wraps the app inside `PrivyProvider`. After login, `useSmartWallets().client` exposes a pre-configured smart account client. `client.account.address` is the deterministic ERC-4337 smart contract address derived from the EOA signer. The contract is lazily deployed — no gas is spent until the first real transaction.

### Connected screen
On successful auth, the app renders two address rows:
- **Smart Wallet** — the ERC-4337 address to use for all onchain activity
- **Signer (EOA)** — the Privy embedded wallet address that signs on behalf of the smart wallet

### Auth state management
`usePrivy().ready` gates rendering until the SDK has rehydrated the session. If a session already exists (returning user), the app skips straight to the connected screen without showing the login button.

---

## Environment

| Variable | Description |
|---|---|
| `VITE_PRIVY_APP_ID` | Privy app ID from dashboard.privy.io |

Copy `.env.example` → `.env.local` and fill in the value.

## Privy Dashboard Setup
1. **Login Methods → Socials** — enable Google
2. **Embedded Wallets → Wallet Creation** — enable wallet creation
3. **Settings → Allowed Origins** — add `http://localhost:5173` for local dev
