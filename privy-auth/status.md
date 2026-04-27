# Privy Auth Mini-App — Status Log

## interpretSignError — Relay solver revert classification — 2026-04-27

**What was done:**
- Added three patterns to `interpretSignError.ts` for Relay solver `Error(string)` reverts: `QUOTE_SWAP_AMOUNT_TOO_SMALL`, `QUOTE_SWAP_AMOUNT_TOO_LARGE`, `NO_LIQUIDITY`. Each matches both the ASCII form and the hex-encoded form (viem surfaces revert data unparsed when the ABI isn't loaded).
- Added matching `SignErrorCode` enum entries: `swap_amount_too_small`, `swap_amount_too_large`, `swap_no_liquidity`.

**Why:**
- Small-amount swaps via /swap (e.g. `$1`) fail at simulation with the solver's `QUOTE_SWAP_AMOUNT_TOO_SMALL` revert. Without classification the user saw a generic "Something went wrong" toast and the BE chat showed only "❌ Swap aborted at step 1/1" — no actionable hint that the amount is the problem.
- Now the user sees "Swap amount is too small for this route. Try a larger amount (typically at least a few dollars)." in both the mini-app error screen and Telegram chat (via `notifyResolved`'s `errorMessage` passthrough).

**Scope:** FE-only error classification. Doesn't change which transactions are sent — only how reverts are explained. No effect on /send, /yield, or the swap's success path.

## SignHandler — fix stale session client across chained steps — 2026-04-27

**What was done:**
- In `SignHandler.tsx`, when chaining to the next swap step via `fetchNextRequest`, clear `sessionClientRef.current = null` before `setCurrentRequest(...)`. The next auto-sign effect re-builds a fresh `KernelAccountClient` via `createSessionKeyClient`.

**Why:**
- The cached `KernelAccountClient` (intended to "avoid re-paying init cost across swap steps") carries internal state from `deserializePermissionAccount` — nonce key, validator/permission resolution. Reusing the same object for a second `sendTransaction` after the first userOp is mined leads to a simulation revert with `0xe52970aa` (a Kernel/permissions error not in the `interpretSignError` table, so it surfaces as `errorCode: "unknown"`). Symptom: step 1 of a /swap succeeds, step 2 reverts during simulation; FE posts a generic rejection and the BE aborts the swap at step 2/2.
- Re-running `createSessionKeyClient` is cheap (one decrypt + a few RPCs) and matches the OLD per-step open/close behavior of the mini app, where each step automatically got a fresh client.

**Scope / blast radius:**
- Only affects the chained-next branch (multi-step flows like /swap and /yield). Single-step flows (/send, single-tx /yield) never enter that branch and therefore see no change.

## Overview
Telegram Mini App (TMA) for **Aegis**, an onchain AI agent. Handles Privy auth (Google + Telegram auto-login), ERC-4337 smart-wallet provisioning, ZeroDev session-key delegation, and a typed request/response bridge to the Aegis backend. Runs inside Telegram WebView; degrades to a normal browser session for dev.

## Tech Stack
- React 19 / Vite 8 / TypeScript (strict)
- Privy v3 (`@privy-io/react-auth` + `/smart-wallets`)
- `@tma.js/sdk-react` (dynamic-imported in `TelegramAutoLogin`)
- `viem` + `permissionless` ^0.2
- ZeroDev Kernel v3.1 + EntryPoint 0.7 (`@zerodev/sdk`, `@zerodev/ecdsa-validator`, `@zerodev/permissions`)
- Avalanche C-Chain mainnet (43114) by default; resolved at runtime via `src/utils/chainConfig.ts` (`VITE_CHAIN_ID`). Fuji (43113) still supported for testing.
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
| `VITE_CHAIN_ID`     | EVM chain ID for session-key ops (default `43114` — Avalanche mainnet) |
| `VITE_CHAIN_RPC_URL` | Standard JSON-RPC for the chain — used by `publicClient` for `eth_call`/`eth_getCode` against kernel factory & validators. **Must NOT be a bundler-only endpoint** (bundler revert envelopes crash viem with `revertError.cause.data.match`). Pimlico's `/v2/<chainId>/rpc` works (it proxies standard RPC too). |
| `VITE_PIMLICO_BUNDLER_URL`  | Pimlico bundler RPC (`https://api.pimlico.io/v2/<chainId>/rpc?apikey=…`) |
| `VITE_PIMLICO_PAYMASTER_URL`| Pimlico paymaster RPC — enables gas sponsorship (same URL as bundler is fine) |
| `VITE_PIMLICO_SPONSORSHIP_POLICY_ID` | Pimlico policy id (e.g. `sp_xxx`) — passed to `getPaymasterData/StubData` so the configured policy actually applies. Without it, paymaster falls back to the project default. |
| `VITE_LOG_LEVEL`    | `debug` \| `info` (default) \| `warn` \| `error` |

All read via `import.meta.env`, narrowed with `?? ''`. See `.env.example`.

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
- `SignResponse` → `{ txHash? } | { rejected: true, errorCode?, errorMessage? }`. **Convention:** on `sendTransaction` failure, FE posts `rejected: true` with the `errorCode` from `interpretSignError` so the BE can drive recovery flows (e.g. `insufficient_token_balance` → /buy nudge in `notifyResolved`). Codes are stable strings; add new ones in lockstep with `SignErrorCode` in `interpretSignError.ts`.
- `ApproveRequest` → `{ subtype, suggestedTokens?, reapproval?, tokenAddress?, amountRaw? }`
- `OnrampRequest` → `{ amount, asset:'USDC', chainId, walletAddress }` (`walletAddress` is the SCA, **not** the EOA)

Responses: `POST {backendUrl}/response` via `postResponse()`. Shapes mirror request type.

## Backend HTTP Endpoints (consumed)
| Method & Path | Used by |
| -------- | ------- |
| `GET  /request/:requestId`              | `useRequest` (requires Privy `Authorization` except for `requestType === 'auth'`) |
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
| `GET  /me`                               | `useUserProfile` — returns `{ pendingFlushed: number }` (one-shot; BE clears after first serve) |
| `GET  /notifications?kind=&limit=`       | `useNotifications` — returns `{ items: NotificationItem[] }` |

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
- `autoSign === true`: build session client via `createSessionKeyClient` (cached in `sessionClientRef` across steps), `sendTransaction({ chain: null })` wrapped in `trackInFlightBroadcast` (see "Broadcast dedupe" below), POST `{ txHash }`. Then `fetchNextRequest(...)` — if next, reset `autoSignAttemptedRef` + `setCurrentRequest(next)`; on 404, close.
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
- `createSessionKeyClient(blob, BUNDLER_URL, PAYMASTER_URL)` paymaster: pass URL → Pimlico-sponsored client; omit → SCA pays. Uses `createPimlicoClient` with EntryPoint 0.7 + gas oracle hook.
- Chain is driven by `getChain()` from `utils/chainConfig.ts` (reads `VITE_CHAIN_ID`). Do not pass `chain` as a parameter — it is resolved internally. **Add new chains to `chainConfig.ts`, not inline.**

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

### Mainnet default + FE chainConfig extraction (2026-04-27)
**What:** Extracted chain resolution out of `crypto.ts` into `utils/chainConfig.ts` (a small registry keyed by chain id). `crypto.ts` now imports `getChain()`. Backend default `CHAIN_ID` flipped from `43113` → `43114`; backend `chainConfig.ts` no longer carries the dead `bundlerUrl`/`paymasterUrl` fields (Pimlico lives in the FE). Drizzle seeds (`tokenRegistry.ts`, `transferToken.ts`) are now CHAIN_ID-driven with both mainnet and Fuji token tables.
**Why:** Inline chain switch in `crypto.ts` violated CLAUDE.md "chain-agnostic" rule; dead BE config invited drift. Mainnet is the live target.
**New conventions:** add new chains by extending `utils/chainConfig.ts` (FE) and `helpers/chainConfig.ts` (BE) — never inline. Seed scripts read `CHAIN_ID` env, default `43114`.

### Pimlico bundler/paymaster migration (2026-04-27)
**What:** Replaced ZeroDev infra (bundler + paymaster) with Pimlico in `crypto.ts`. All `@zerodev/*` SDK packages are **kept** (they provide Kernel v3.1 contract bindings — removing them would break all existing smart accounts). Chain is now driven by `VITE_CHAIN_ID` (defaulting to Avalanche mainnet 43114) via a `getChain()` helper — no more hardcoded `avalancheFuji`.

**Why:** ZeroDev Pro plan ($69/mo) required for mainnet RPC traffic; Pimlico is PAYG with a free tier. Chain ID was hardcoded to Fuji (43113) but the live app runs on mainnet (43114).

**New conventions:**
- Env vars are `VITE_PIMLICO_BUNDLER_URL` / `VITE_PIMLICO_PAYMASTER_URL` (old `VITE_ZERODEV_RPC` / `VITE_PAYMASTER_URL` are gone).
- `VITE_CHAIN_ID` controls which viem chain is used in `crypto.ts`; resolves via `getChain()` — add new chain IDs there.
- The term "ZeroDev" remains only as the wire-format label `ZerodevMessage` on the FE↔BE delegation protocol — do not rename in unrelated PRs.
- `createSessionKeyClient` now uses `createPimlicoClient` (from `permissionless/clients/pimlico`) with EntryPoint 0.7 pinned, and includes `estimateFeesPerGas` via `getUserOperationGasPrice().fast` (recommended on Avalanche to avoid stale gas estimates).

**Rollback:** revert `crypto.ts` + 3 mechanical renames + restore old env vars — no on-chain state changes.

### Endpoint auth hardening — `useRequest` (2026-04-25)
`GET /request/:requestId` now requires `Authorization: Bearer <privyToken>` for `sign`/`approve` requests. `useRequest` pulls the token via `usePrivyToken()` and attaches it when non-null. The token is omitted on the first hit for `auth` requests (user has no token yet — BE keeps this endpoint unauthenticated for `auth`). 401/403 responses surface via `log.warn` (→ sonner toast). Token is never logged.

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

### Recipient notifications — activity feed (2026-04-27)
**What:** Added read-only "Recent Transfers" section to `HomeTab` surfacing inbound p2p transfers via a new `GET /notifications?kind=p2p_send&limit=20` endpoint. Also shows a one-shot welcome banner when the BE flushes pending notifications after `/start`.
- New hook `src/hooks/useNotifications.ts` (`useNotifications`) — wraps `useFetch` with auth headers from `useAppConfig()`. Returns `{ items, loading, error }`.
- New type `NotificationItem` exported from `useNotifications.ts`.
- `src/utils/chainConfig.ts` extended with `buildExplorerUrl(chainId, txHash)` and `chainName(chainId)` — use these; never inline chain IDs or explorer URLs.
- `src/hooks/useAppData.tsx` extended with `UserProfile` type (`{ pendingFlushed: number }`), a `useFetch` for `GET /me`, and new selector `useUserProfile()`. `pendingFlushed` field is one-shot (BE clears after serving); cached only in component state, not localStorage.
- `src/components/HomeTab.tsx` — added `RecentTransfers` section (after `YieldPositions`), `NotificationRow` component, and dismissable welcome flush banner. Logger scopes: `homeTab` and `notificationRow`.

**Why:** Delivery is entirely via the Telegram bot; the Mini App is secondary surfacing for "who paid me" history. No SSE/push needed — simple `useFetch` on mount covers v1.

**New conventions:**
- Any future "things that happened *to* the user" feature should extend the `recipientNotifications` table on BE and add a new `kind` filter to `useNotifications` — not a new endpoint.
- New client log metadata field: `count` (number of fetched notification items in a batch).
- `buildExplorerUrl` / `chainName` live in `utils/chainConfig.ts` — extend there for new chains.

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
- `autoSign: true` → `createSessionKeyClient(blob, BUNDLER_URL, PAYMASTER_URL)`.
- `autoSign: false` → `useSmartWallets()`.

### Rule 3: Pimlico — one URL for bundler and paymaster
Both `VITE_PIMLICO_BUNDLER_URL` and `VITE_PIMLICO_PAYMASTER_URL` can point at the same Pimlico per-chain endpoint (`https://api.pimlico.io/v2/<chainId>/rpc?apikey=…`). Pimlico routes `eth_sendUserOperation` vs `pm_getPaymasterStubData` internally. Keep them as two separate env vars for independent override capability.

### Rule 4: `autoSignError` must stay surfaced
Never `setAutoSignError(null)` without also clearing `autoSignAttemptedRef.current`. Never render only as a toast/banner — must be in a copyable view (Telegram clips overlays). Log every failure with `[AEGIS:SignHandler]` prefix.

### Rule 5: `serializedBlob === null` is not terminal
Pair with `delegatedKey.state.status`:
- `processing` → wait indefinitely (unlock in flight).
- `idle`/`error` no blob → genuine "no key"; arming 10s fallback OK.
- `done` with blob → execute.

Any new auto-sign handler **must** take `keyStatus` as a prop from `App.tsx`.

### Rule 6: Broadcast dedupe is two-layered — both required
A signing payload `(to, value, data)` can arrive twice for one user intent (BE re-emits `sign_calldata` after a `waitFor` timeout, agent loops, FE effect re-fires on swap, StrictMode double-mount). Without dedupe, the first send mines + drains the wallet and the second send's bundler-side gas estimation reverts with `ERC20: transfer amount exceeds balance` — surfaced as a spurious error toast over a successful tx.

Two layers in `utils/recentBroadcasts.ts`:
- `trackInFlightBroadcast(to, value, data, send)` — in-memory `Map<payloadKey, Promise<hash>>`. Coalesces *concurrent* sends within the tab. Always wrap `sessionClient.sendTransaction` in this for auto-sign paths.
- `findRecentBroadcast(...)` + `recordBroadcast(...)` — localStorage, 10min TTL. Catches *post-completion* duplicates across reloads.

Order in handler: check `findRecentBroadcast` first (reuse hash, skip send); else `trackInFlightBroadcast(...)` to do the send. `recordBroadcast` is called by `trackInFlightBroadcast` on success — do not call it directly.

### Pre-ship checklist (new sign-capable handler)
- [ ] `autoSign:true` path uses `createSessionKeyClient` with both `ZERODEV_RPC`+`PAYMASTER_URL`.
- [ ] Auto-sign errors render a persistent error view, not a modal.
- [ ] `autoSign:false` path uses `SigningRequestModal`.
- [ ] Consumes `keyStatus` and waits on `processing`.
- [ ] Logs `[AEGIS:<HandlerName>]` prefix.
- [ ] No hardcoded chain object/RPC — pull from `utils/chainConfig.ts`/env.

---

## Known Invariants / Gotchas
- Chain is driven by `VITE_CHAIN_ID` (defaults `43114` — Avalanche mainnet). `getChain()` in `utils/chainConfig.ts` resolves it to a viem chain object; **add new chains to that registry, not inline**. Multi-chain support already threads `chain` through all clients in `installSessionKey` / `createSessionKeyClient`.
- Privy token refresh is the caller's responsibility — `usePrivyToken` fetches once on `authenticated` flip; long sessions may see stale tokens. Re-mount or call `getAccessToken()` if 401 bounces.
- `useRequest` reads `requestId` once at mount. For chained swap steps, `SignHandler` uses `fetchNextRequest` directly — URL stays fixed.
- `SmartWalletsProvider` must wrap `App`; `useSmartWallets()` throws otherwise.
- No test runner — static stateless-routing regression guard deferred until vitest is added.
