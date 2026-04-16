# Execution Context Log

## 2026-04-11T16:39:22
- **Task Summary**: Resolved `ERESOLVE` peer dependency conflict for `ox` package when running `npm install`.
- **Files Modified**: `package-lock.json`
- **Commands Executed**: `source ~/.zshrc && npm install --legacy-peer-deps`
- **Tests Run & Results**: N/A (Environment setup step, no unit tests executed)
- **Known Risks, Assumptions, or Limitations**: `--legacy-peer-deps` skips strict peer dependency validation. A known risk is that Viem and Permissionless might use slightly different minor versions of `ox` under the hood. However, this is the standard resolution in Web3 projects running these specific libraries, and typically does not cause runtime issues.

## 2026-04-12T19:19:00
- **Task Summary**: Permanently resolved `ERESOLVE` peer dependency conflict for `ox` package by adding an npm override.
- **Files Modified**: `package.json`, `package-lock.json`
- **Commands Executed**: `source ~/.zshrc && npm install`
- **Tests Run & Results**: `npm install` completed successfully (Exit code 0).
- **Known Risks, Assumptions, or Limitations**: Overriding `ox` to `0.14.5` forces `permissionless` to use the version provided by `viem`. This avoids the need for `--legacy-peer-deps` on every install. Minor version deviations might exist, but this correctly reconciles the versions.

## 2026-04-16T08:32:00+07:00
- **Task Summary**: Implemented Telegram auto-login via `Privy.loginWithTelegram` per `constructions/telegram-login-plan.md`. Eliminates manual Google OAuth step when opening the Mini App from Telegram.
- **Files Modified**:
  - `src/main.tsx` — Added `'telegram'` to `loginMethods`; imported and mounted `<TelegramAutoLogin />` inside `<SmartWalletsProvider>` before `<App />`
  - `src/components/TelegramAutoLogin.tsx` — **NEW** — Silent side-effect component; reads `initDataRaw` from `@tma.js/sdk-react`, calls `loginWithTelegram({ initDataRaw })` once per mount; guards for non-TMA context, already-authenticated state, and SDK version compatibility
  - `src/App.tsx` — Removed `sendData` relay effect (superseded); added TMA loading guard (`isTmaContext` / `showLogin`) to suppress `LoginView` flicker while auto-login is in flight
- **Commands Executed**:
  - `npm run build` (via nvm) — run twice to confirm
- **Tests Run & Results**:
  - First build: 10 TS errors — 9 pre-existing (ox node_modules, crypto.ts, decodeEip712.ts, telegramStorage.ts) + 1 new (`loginWithTelegram` not typed on `PrivyInterface`)
  - Added `// @ts-ignore` per plan guardrail (Step 2) — do not change package version
  - Second build: 9 errors — all pre-existing, zero new errors introduced by this feature
- **Known Risks, Assumptions, or Limitations**:
  - `loginWithTelegram` is present at runtime in `@privy-io/react-auth ^3.21.0` but missing from the TypeScript declarations; suppressed with `@ts-ignore` until upstream types are updated
  - `sendData` relay removal means the backend `bot.on("message:web_app_data")` handler will never fire from the frontend; backend should decide whether to keep or remove it
  - Auto-login only triggers inside real Telegram WebView (`window.Telegram?.WebApp`); falls back to Google OAuth in browser
  - `initDataRaw` is never logged in production builds (guarded via `import.meta.env.DEV`)
  - Full E2E verification inside real Telegram Mini App context required before production release (cannot be tested in browser)
