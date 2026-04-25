# Privy Auth Mini-App — Status Log

## Overview
Telegram Mini App (TMA) for **Aegis**, an onchain AI agent. Handles Privy auth (Google + Telegram auto-login), ERC-4337 smart-wallet provisioning, ZeroDev session-key delegation, and a typed request/response bridge to the Aegis backend. Runs inside Telegram WebView; degrades to a normal browser session for dev.

## Tech Stack
- React 19 / Vite 8 / TypeScript (strict)
- Privy v3 (`@privy-io/react-auth` + `/smart-wallets`)
- `@tma.js/sdk-react` (dynamic-imported in `TelegramAutoLogin`)
- `viem` + `permissionless` ^0.2
- ZeroDev Kernel v3.1 + EntryPoint 0.7 (`@zerodev/sdk`, `@zerodev/ecdsa-validator`, `@zerodev/permissions`)
- Avalanche Fuji (43113) — hard-coded in `src/utils/crypto.ts`
- Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.*`)
- Vite + `vite-plugin-node-polyfills` (only `buffer`); `@solana/kit`, `@solana-program/system`, `@solana-program/token` external; `permissionless` must stay bundled.

## Project Layout
```
src/
├── main.tsx                       # Privy + SmartWallets providers + TelegramAutoLogin
├── App.tsx                        # Router: auth gate → request dispatcher
├── index.css                      # Tailwind entry + TMA safe-area body padding
├── telegram.d.ts                  # Telegram WebApp + CloudStorage types
├── components/
│   ├── TelegramAutoLogin.tsx      # Silent loginWithTelegram on TMA mount
│   ├── ApprovalOnboarding.tsx     # Spending-limit grant UI (aegis_guard)
│   ├── StatusView.tsx             # Tabbed home (TabDock: home/points/configs/debug)
│   ├── HomeTab.tsx                # Portfolio + delegation status + YieldPositions
│   ├── PointsTab.tsx              # Loyalty balance, history, leaderboard
│   ├── ConfigsTab.tsx             # Wallet/agent addresses, permissions, disconnect
│   ├── DebugTab.tsx               # Console viewer + level toggle
│   ├── SigningRequestModal.tsx    # Manual sign fallback
│   ├── YieldPositions.tsx         # Inline yield section in HomeTab
│   ├── atomics/                   # icons.tsx, spinner.tsx, FullScreen.tsx
│   ├── handlers/                  # AuthHandler, SignHandler, ApproveHandler,
│   │                              # OnrampHandler, YieldDepositHandler
│   └── views/login.tsx
├── hooks/
│   ├── privy.ts                   # usePrivyToken
│   ├── useRequest.ts              # Reads ?requestId=… and fetches /request/:id
│   ├── useFetch.ts                # Generic authed-GET hook
│   ├── useAppData.tsx             # AppDataProvider — portfolio/grants/yield/config
│   ├── useLoyalty.ts              # useLoyaltyBalance / History / Leaderboard
│   ├── useDebugEntries.ts         # console interceptor (filters [AEGIS:)
│   └── useDelegatedKey.ts         # Session-keypair state machine
├── types/miniAppRequest.types.ts  # Single source of truth for DTOs
└── utils/
    ├── crypto.ts                  # Keypair gen, AES-GCM, ZeroDev session-key install
    ├── telegramStorage.ts         # CloudStorage wrapper + localStorage dev fallback
    ├── loggedFetch.ts             # raw per-attempt request logger
    ├── resilientFetch.ts          # 429/5xx jittered backoff (retries 4x, 250ms→2s)
    ├── fetchNextRequest.ts        # polls /request/:id?after=… for next step
    ├── postResponse.ts            # Typed POST /response
    ├── logger.ts                  # createLogger; sonner toasts on warn/error
    └── toErrorMessage.ts
```

Planning docs under `constructions/` are historical, not source-of-truth.

## Environment Variables
| Variable | Purpose |
| -------- | ------- |
| `VITE_PRIVY_APP_ID` | Privy application ID |
| `VITE_BACKEND_URL`  | Backend HTTP API base URL (no trailing slash) |
| `VITE_ZERODEV_RPC`  | ZeroDev bundler RPC (also paymaster — same URL) |
| `VITE_PAYMASTER_URL`| ZeroDev paymaster RPC — enables gas sponsorship |
| `VITE_LOG_LEVEL`    | `debug` \| `info` (default) \| `warn` \| `error` |

All read via `import.meta.env`, narrowed with `?? ''`. No `.env.example`.

## Entry Wiring (`main.tsx`)
- Calls `Telegram.WebApp.ready()`, `.expand()`, header/background `#0f0f1a` **before** React mounts.
- Providers: `StrictMode > PrivyProvider > SmartWalletsProvider > { TelegramAutoLogin, App }`.
- PrivyProvider: `loginMethods: ['google','telegram']`, dark theme, accent `#7c3aed`, `embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'`.

## Top-Level Flow (`App.tsx`)
Single-route URL-driven dispatcher:
1. `!ready` → `<LoadingSpinner />`.
2. `!authenticated || !privyToken` → spinner if inside TMA and `tmaLoginTimedOut===false` (timeout `TMA_AUTO_LOGIN_TIMEOUT_MS=4000`); else `<LoginView />`.
3. No `requestId` → `<StatusView />`.
4. `requestLoading` → spinner; `requestError` → `<ErrorView />`.
5. Dispatch on `request.requestType`: `auth` → `AuthHandler`, `sign` → `SignHandler` (or `YieldDepositHandler` when `request.kind === 'yield_deposit' | 'yield_withdraw'`), `approve` → `ApproveHandler`, `onramp` → `OnrampHandler`.

Session-key auto-bootstrap: guarded by `autoKeyStartedRef`. Skipped for `auth` requests (AuthHandler runs `start()` itself). Inside TMA + no `requestId` → `delegatedKey.start()`. Else → `delegatedKey.unlock()` (restore-only, no popup).

## Typed Request/Response Contract
`src/types/miniAppRequest.types.ts` is the **only** source of truth.
```ts
RequestType    = 'auth' | 'sign' | 'approve' | 'onramp'
ApproveSubtype = 'session_key' | 'aegis_guard'
SignKind       = 'yield_deposit' | 'yield_withdraw'  // optional; routes to YieldDepositHandler
```
- `AuthRequest` → `{ telegramChatId }`
- `SignRequest` → `{ to, value (wei dec string), data (0x), description, autoSign, kind?, chainId?, protocolId?, tokenAddress?, steps?, displayMeta? }`
- `ApproveRequest` → `{ subtype, suggestedTokens?, reapproval?, tokenAddress?, amountRaw? }`
- `OnrampRequest` → `{ amount, asset:'USDC', chainId, walletAddress }` (`walletAddress` is the SCA, **not** the EOA)

Responses: `POST {backendUrl}/response` via `postResponse()`. Shapes mirror request type.

## Backend HTTP Endpoints (consumed)
| Method & Path | Used by |
| -------- | ------- |
| `GET  /request/:requestId`              | `useRequest` |
| `GET  /request/:requestId?after=<id>`   | `fetchNextRequest` (next queued step or 404) |
| `POST /response`                         | `postResponse` |
| `GET  /portfolio`                        | `AppDataProvider` (HomeTab) |
| `GET  /yield/positions`                  | `AppDataProvider` (YieldPositions) |
| `GET  /delegation/grant`                 | `AppDataProvider` (ConfigsTab) |
| `POST /delegation/grant`                 | `ApprovalOnboarding` |
| `GET  /delegation/approval-params`       | `ApprovalOnboarding` (forwards `tokenAddress`+`amountRaw` query) |
| `GET  /loyalty/balance`                  | `useLoyaltyBalance` |
| `GET  /loyalty/history?limit=&cursorCreatedAtEpoch=` | `useLoyaltyHistory` |
| `GET  /loyalty/leaderboard?limit=`       | `useLoyaltyLeaderboard` (no auth header) |

All authed calls send `Authorization: Bearer ${privyToken}`. 404/410 on `/request/:id` → "not found" / "expired".

## Handlers

### `AuthHandler`
Three-step effect chain, each ref-guarded against StrictMode:
1. POST auth response → optional `approveRequestId`. Prefer `Telegram.WebApp.initDataUnsafe.user.id` over `request.telegramChatId`.
2. If `approveRequestId`, call `startDelegatedKey()` once state is `idle`.
3. On `done`, POST approve response with `subtype: 'session_key'` + `delegationRecord`.
4. On `allDone`, `Telegram.WebApp.close()` after 1500ms.

### `SignHandler`
- `currentRequest` state initialised from prop; resyncs when parent passes a new `requestId`.
- `autoSign === true`: build session client via `createSessionKeyClient` (cached in `sessionClientRef` across steps), `sendTransaction({ chain: null })`, POST `{ txHash }`. Then `fetchNextRequest(...)` — if next, reset `autoSignAttemptedRef` + `setCurrentRequest(next)`; on 404, close.
- Manual fallback (`autoSign:false`, or 10s timer with `keyStatus !== 'processing'`): render `<SigningRequestModal />`. Approve uses `useSmartWallets().client.sendTransaction` (Privy EOA path, no paymaster).
- Reject → POST `{ rejected: true }` + close.
- Takes `keyStatus` prop; only arms 10s fallback when not `processing` (see Rule 5 below).

### `YieldDepositHandler`
Single file; `mode: 'deposit' | 'withdraw'`. Auto-open-and-sign when `autoSign && serializedBlob`: opens in `'signing'`, runs the session-key pipeline, POSTs txHash, closes after 1500ms. Fallback shows pre-sign confirmation with `displayMeta` (protocol, token, amount, APY); manual send goes through `useSmartWallets().client`. Auto-sign failures fall back to the manual screen with inline error banner. Currently waits indefinitely on blob (no fallback timer).

### `ApproveHandler`
- `subtype === 'session_key'`: auto `startDelegatedKey()`, POST delegation record, close.
- `subtype === 'aegis_guard'`: render `<ApprovalOnboarding />`. ApprovalOnboarding reads `tokenAddress`+`amountRaw` from **props only** — never URL.

### `OnrampHandler`
Auto-invokes `useFundWallet().fundWallet({ address: request.walletAddress, chain: { id: request.chainId }, options: { asset: 'USDC' } })` once `ready && authenticated`. No confirmation (already confirmed upstream by Telegram button click). Errors render retry + monospace SCA address fallback. **Convention:** a handler may auto-invoke its primary action when the user already confirmed upstream.

## `useDelegatedKey` Conventions
- **Deterministic seed** — keypair AES-GCM encrypted with `privyDid` as PBKDF2 password. No prompt ever.
- Storage key: `STORAGE_KEY = "delegated_key"` in Telegram CloudStorage.
- State machine: `idle | processing{step} | done{record} | error{message}`.
- `start()` idempotent: CloudStorage hit → decrypt; miss → create + install + encrypt. Decrypt failure falls through to create.
- `unlock()` restore-only — never generates, never popups. Stale blobs cleared, drops to `idle`.
- `removeKey()` wipes CloudStorage; transitions to `error` ("reload to create").
- `updateBlob(newBlob)` re-encrypts without regenerating (used when reinstalling on-chain permissions).
- Rejection: `err.code === 4001` or `err.message.includes('User rejected')`.
- Exposes both `serializedBlob` state **and** `serializedBlobRef` (sync access in async callbacks) — deliberate.
- `DEFAULT_PERMISSIONS` is placeholder (native AVAX, ~30d, 1×10¹⁸); real per-token limits flow through `ApprovalOnboarding` → `POST /delegation/grant`.

## `utils/crypto.ts` Conventions
- **Never** use `installSessionKeyWithErc20Limits` (removed 2026-04-22). Only `installSessionKey` (sudo policy) exists. Per-token limits enforced **server-side**.
- AES-GCM blob: `[16 salt][12 iv][ciphertext]`, PBKDF2-SHA256 @ 100k iters. Use `encryptBlob`/`decryptBlob` only.
- Install path: `privy embedded provider → viem WalletClient → toOwner → signerToEcdsaValidator → toECDSASigner(empty addr) → toPermissionValidator({ policies:[toSudoPolicy({})] }) → createKernelAccount({ plugins:{sudo,regular} }) → serializePermissionAccount(account, sessionPrivateKey)`.
- **Serialized blob contains the session private key.** Store only in (encrypted) CloudStorage. **Never** send to backend.
- `createSessionKeyClient(blob, ZERODEV_RPC, PAYMASTER_URL)` paymaster: pass URL → sponsored client; omit → SCA pays.

## Styling Conventions
- BG: `bg-[#0f0f1a]` full-screen; `bg-[#161624]` / `#16162a` cards; `bg-white/5` / `bg-white/[0.04]` rows.
- Borders: `border-white/10` (cards), `/[0.08]` subtle, `border-violet-500/20` accent.
- Brand: violet-500/600 (`#7c3aed`) + indigo-600 gradients; emerald-400 success; amber-500 warn; red-400/500 error.
- Shield+checkmark = Aegis logo (use per-instance `linearGradient id` like `auth-ok-shield`).
- Full-screen layout: `flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-N`. Always `min-h-dvh`.
- Spinner: `w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin`.
- Section labels: `text-[10px] font-semibold tracking-widest text-white/30 uppercase`.
- Safe areas already on `body` in `index.css` — don't re-add.
- Prefer Tailwind arbitrary values; no `tailwind.config.*` exists.

## Telegram WebView Conventions
- `window.Telegram?.WebApp?.initData` presence = canonical "inside Telegram" check (`isInsideTelegram()` in `App.tsx`).
- All success flows: `window.Telegram?.WebApp?.close()` after 1500ms "Taking you back…" screen.
- CloudStorage gated to WebApp v6.9+; `telegramStorage.ts` installs a localStorage mock at module load. Always go through `cloudStorageGetItem/SetItem/RemoveItem`.
- `TelegramAutoLogin` is silent: errors never surface, logs only in `import.meta.env.DEV`. `loginWithTelegram` `@ts-ignore` is intentional.

## Logging & Debug
- **Logger** (`src/utils/logger.ts`): `const log = createLogger('Module')`. Raw `console.*` forbidden except early `main.tsx` bootstrap.
- Levels: `debug`/`info` → console + DebugTab buffer; `warn`/`error` → also sonner toasts.
- Runtime gate: `localStorage["aegis.logLevel"]` or `window.__aegisLog("debug")`. Build-time default via `VITE_LOG_LEVEL=info`.
- Output prefix `[AEGIS:scope]` — `useDebugEntries` filters on this.
- DebugTab levels: log (white), info (blue), warn (yellow), error (red); 4-button toggle.
- **Privacy:** never log `privyToken`, `initData`, `serializedBlob`, `privyDid`, signatures. Truncate via `token.slice(0,8)+'…'`.
- **Step pattern (handlers):** `log.info('step', { step: 'started'|'submitted'|'succeeded'|'failed', requestId })`.
- `<Toaster>` mounted once in `App.tsx`: `position="top-center" richColors closeButton theme="dark"`.
- Dev-only UI (e.g. "Wipe CloudStorage" in `ApprovalOnboarding`) gated on `import.meta.env.DEV`.

## Coding Conventions
- React 19 function components only. Default export only at `App.tsx` / `main.tsx`.
- Refs guard StrictMode double-fires (`hasStartedRef`, `attemptedRef`, `authPostedRef`, …) on every single-shot effect.
- `0x${string}` for addresses/hex; raw amounts: `string` over wire, `BigInt(...)` at call site.
- Async IIFE in `useEffect`; never `async` the effect itself.
- Errors: `toErrorMessage(err)` for display; otherwise narrow with `err instanceof Error`.
- Flat by convention — `src/utils` and `src/components` (except `atomics/`, `handlers/`, `views/`).
- `eslint-disable-next-line react-hooks/exhaustive-deps` allowed when narrowly scoped.

## Build & Scripts
`dev`/`build`/`typecheck` (`tsc -b`)/`lint`/`preview`. `overrides.ox: 0.14.5` pinned for Privy/viem transitive — don't bump without checking peer range.

---

## Feature Log

### Points / Loyalty (2026-04-25)
Read-only Points tab: balance card, recent ledger activity (cursor-paginated), top-10 leaderboard.
- Hooks (`useLoyalty.ts`): `useLoyaltyBalance`, `useLoyaltyHistory` (`loadMore()`+`hasMore`), `useLoyaltyLeaderboard`. Internal `useResilientGet` consolidates cancel+tick+visibility for balance/leaderboard. Each hook returns explicit `unauthorized` flag — only true 401 collapses to leaderboard-only.
- Balance refetches on `visibilitychange`; history resets to page 0.
- `pointsTotal` is opaque string throughout — never `Number()`.
- Leaderboard call omits `Authorization` (public endpoint).
- `ACTION_LABELS` map at top of `PointsTab.tsx`. Seven canonical BE actionTypes: `swap_same_chain`, `swap_cross_chain`, `send_erc20`, `yield_deposit`, `yield_hold_day`, `referral`, `manual_adjust`. Unknown ids render raw.
- BE timestamps are **epoch seconds** (`newCurrentUTCEpoch()`) — `relativeTime` operates on seconds.
- `nextCursor` = `createdAtEpoch` of last row or null. `hasMore = cursor != null` (never compare lengths).

### Yield Optimization (2026-04-24)
- New `SignKind` values `yield_deposit | yield_withdraw` route to `YieldDepositHandler` before `SignHandler`.
- Wire contract `GET /yield/positions` → `{ positions: YieldPosition[], totals: { principalHuman, currentValueHuman, pnlHuman } }`. `YieldPosition`: `protocolId, protocolName, chainId, tokenSymbol, principalHuman, currentValueHuman, pnlHuman, pnl24hHuman, apy`. `parseYieldPositions` in `useAppData.tsx` normalises.
- `YieldPositions` component mounted inline below portfolio in `HomeTab` (chosen over a dedicated route).
- **Convention:** yield `SignRequest.kind` prefixed `yield_`; positions go through `AppDataProvider` (`useYieldPositions()`) — never ad-hoc fetch.

### Multi-step swap (2026-04-24)
`SignHandler` chains via `fetchNextRequest(backendUrl, requestId)` on `GET /request/:id?after=<prev>`; backend indexes pending sign requests per-user in Redis ZSET (`user_pending_signs:<userId>`). Fixed-interval retry 6×400ms (BE creates step N+1 shortly after FE posts step N). Convention: a handler MAY keep the WebApp open across multiple same-type requests when BE signals continuation; default remains close-after-one. **`fetchNextRequest` lives in `utils/`, not `hooks/`** — utilities, not React hooks.

### Onramp (2026-04-23)
`requestType: 'onramp'` → `OnrampHandler` (see Handlers above).

### Resilient fetch (2026-04-24)
- `resilientFetch.ts`: retries 429/502/503/504 up to 4× with jittered exp backoff (250ms→2s); honors `Retry-After`; 401/404/410 pass through immediately. Used in `postResponse`, `fetchNextRequest`, `useFetch`.
- `fetchNextRequest` keeps its own outer 404-retry loop (6×400ms) for "BE creating next step" — different job from `resilientFetch`'s transport retry. Don't collapse.
- `toErrorMessage`: 429/503 → `'Service is busy. Try again in a moment.'`.
- **Stateless-routing invariant** (verified 2026-04-24): zero use of cookies, `credentials: 'include'`, or server-issued opaque handles in client state. Every request self-authenticates with `Authorization: Bearer <privyToken>`. Server-issued `requestId` resolves on any replica via Redis. Violations require `// STATELESS-AUDIT: allowed because <reason>` + BE sticky-routing config.

### AppDataProvider — global tab data (2026-04-23)
`useAppData.tsx` owns `useFetch` for portfolio, grants, yield positions; provider mounted once around `StatusView` tabs so tab-switch doesn't refire fetches. Selectors: `usePortfolio()`, `useDelegations()`, `useYieldPositions()`, `useAppConfig()` (returns `{backendUrl, privyToken}`). Parsers (`parsePortfolio`, `parseGrants`, `parseYieldPositions`) and types live here. **Convention:** shared cross-tab data belongs in `AppDataProvider`; do not call `useFetch` inline in tabs that can be unmounted by `TabDock`. Mutation refresh hook not yet wired (provider lifetime ≈ one session).
**Cross-cutting risk:** `backendUrl`+`privyToken` in context value re-render consumers when token rotates; benign because Privy tokens are stable for session lifetime.

### ConfigsTab permissions field alignment (2026-04-23)
FE was reading `symbol`/`maxAmount`/`spent` but BE (`TokenDelegation`) emits `tokenSymbol`/`limitRaw`/`spentRaw`/`tokenDecimals`. Renamed FE fields. **Convention:** when surfacing delegation rows, divide `limitRaw`/`spentRaw` by `10 ** tokenDecimals` via BigInt — never display raw.

### Frictionless delegation refactor (2026-04-22) — REMOVED, do not reintroduce
`PasswordDialog`, `AegisGuardToggle`, `AegisGuardModal`, `useAegisGuard`, `installSessionKeyWithErc20Limits`, `Erc20SpendingLimit`, password-based blob encryption.

### Dead-code cleanup (2026-04-23) — REMOVED, do not reintroduce
`SigningApprovalModal`, `signingInterceptor`, `decodeEip712`, `DelegationDebugPanel`, `ErrorView` (replaced by `FullScreenError`), unused `Keypair` / `AegisGrant` / duplicate `DelegationRecord` exports.

### Shared atomics (post-2026-04-23)
- `atomics/spinner.tsx`: `<Spinner size="xs|sm|md|lg" />`, `<LoadingSpinner />`.
- `atomics/icons.tsx`: `<ShieldIcon size? variant="violet|success">` (gradient id via `useId()`), `<GoogleIcon />`.
- `atomics/FullScreen.tsx`: `<FullScreen>`, `<FullScreenLoading step?>`, `<FullScreenError message showClose?>`, `<FullScreenSuccess title subtitle?>` — caller still calls `.close()` itself.

---

## Critical Rules — Sign Flow (DO NOT VIOLATE)

Source: hard-won fixes 2026-04-24. Read before touching `SignHandler.tsx`, `YieldDepositHandler.tsx`, or any new auto-signing handler.

### Three request classes
1. **`autoSign: true`** — BE emitted via `sign_calldata`; delegation already sufficient. Mini-app must execute silently via session key. **Do not prompt user.**
2. **`autoSign: false`** — explicit confirmation required. `SigningRequestModal` + Privy smart-wallet client.
3. **`auth` / `approve`** — separate handlers; drive `delegatedKey.start()` themselves.

### Rule 1: auto-sign failures MUST NOT pop manual modal
Manual sign uses the same SCA + chain + paymaster — if session-key UserOp fails (AA21, paymaster 404, prefund), manual fails identically and submits a second doomed UserOp. Render a full-screen error view instead: raw error text (selectable, copyable), diagnostics (`bundler:set|MISSING`, `paymaster:set|MISSING`, `to`, `value`, `dataLen`), Close button.

### Rule 2: `SigningRequestModal` is only for `autoSign: false`
Modal uses `useSmartWallets().client.sendTransaction` (Privy EOA, no ZeroDev paymaster). Never a fallback for an auto-sign path expecting sponsorship. New handler split:
- `autoSign: true` → `createSessionKeyClient(blob, ZERODEV_RPC, PAYMASTER_URL)`.
- `autoSign: false` → `useSmartWallets()`.

### Rule 3: ZeroDev v3 — bundler URL == paymaster URL
Both `VITE_ZERODEV_RPC` and `VITE_PAYMASTER_URL` must be `https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/<CHAIN_ID>`. Method name (`eth_sendUserOperation` vs `pm_getPaymasterStubData`) routes bundler vs paymaster on ZeroDev's side. **Do not invent a `/paymaster/` path segment** (404s with `Cannot POST /api/v3/paymaster/.../chain/...`). v2 used a different shape — we're on v3.

### Rule 4: `autoSignError` must stay surfaced
Never `setAutoSignError(null)` without also clearing `autoSignAttemptedRef.current`. Never render only as a toast/banner — must be in a copyable view (Telegram clips overlays). Log every failure with `[AEGIS:SignHandler]` prefix.

### Rule 5: `serializedBlob === null` is not terminal
Pair with `delegatedKey.state.status`:
- `processing` → wait indefinitely (unlock in flight).
- `idle`/`error` no blob → genuine "no key"; arming 10s fallback OK.
- `done` with blob → execute.

Any new auto-sign handler **must** take `keyStatus` as a prop from `App.tsx`.

### Pre-ship checklist (new sign-capable handler)
- [ ] `autoSign:true` path uses `createSessionKeyClient` with both `ZERODEV_RPC`+`PAYMASTER_URL`.
- [ ] Auto-sign errors render a persistent error view, not a modal.
- [ ] `autoSign:false` path uses `SigningRequestModal`.
- [ ] Consumes `keyStatus` and waits on `processing`.
- [ ] Logs `[AEGIS:<HandlerName>]` prefix.
- [ ] No hardcoded chain object/RPC — pull from `crypto.ts`/env (and lift to a FE `chainConfig` when multi-chain ships, per root CLAUDE.md).

---

## Known Invariants / Gotchas
- Chain hard-coded to **Avalanche Fuji** in `crypto.ts`. Multi-chain support requires threading `chain` through `installSessionKey`, `createSessionKeyClient`, wallet/public clients.
- Privy token refresh is the caller's responsibility — `usePrivyToken` fetches once on `authenticated` flip; long sessions may see stale tokens. Re-mount or call `getAccessToken()` if 401 bounces.
- `useRequest` reads `requestId` once at mount. For chained swap steps, `SignHandler` uses `fetchNextRequest` directly — URL stays fixed.
- `SmartWalletsProvider` must wrap `App`; `useSmartWallets()` throws otherwise.
- No test runner — static stateless-routing regression guard deferred until vitest is added.
