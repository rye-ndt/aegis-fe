# Privy Auth Mini-App — Status Log

## Onramp — 2026-04-23

Added `requestType: 'onramp'` handled by `components/handlers/OnrampHandler.tsx`.

**Payload** (`OnrampRequest` in `src/types/miniAppRequest.types.ts`):
`{ amount: number, asset: 'USDC', chainId: number, walletAddress: string }`.
`walletAddress` is the user's **smart account** address — not the embedded EOA.

**Behaviour:**
- Auto-invokes `useFundWallet().fundWallet({ address, options })` on mount once `ready && authenticated`. No extra click — the Telegram button click was the confirmation.
- Passes `address: request.walletAddress` explicitly so Privy funds the smart account, not the embedded EOA (the default). Silent mismatch here would deliver funds to an address the app doesn't treat as the user's wallet.
- `chain: { id: request.chainId }` — Privy's `ChainLikeWithId = { id: number }`, so no helper file needed.
- `asset: 'USDC' | 'native-currency'` — backend currently only emits USDC.
- Errors (unsupported chain, modal closed) render a retry button plus the monospace smart-account address as a manual-deposit fallback.

**Convention introduced:** a request handler may auto-invoke its primary action on mount (no confirmation screen) when the user has already confirmed upstream. Keeps the "minimal-clicks for non-web3 users" goal intact.

**Not wired:** on-chain deposit settlement detection — that belongs on the backend.

## Overview
A Telegram Mini App (TMA) front end for **Aegis**, an onchain AI agent. Handles
Privy auth (Google + Telegram auto-login), ERC-4337 smart-wallet provisioning,
ZeroDev session-key delegation, and a typed request/response bridge to the Aegis
backend. Designed to open inside a Telegram WebView; degrades cleanly to a
regular browser session for local dev.

## Technical Stack
- **Framework**: React 19 / Vite 8 / TypeScript (strict)
- **Auth & Wallet**: Privy v3 SDK (`@privy-io/react-auth` + `/smart-wallets`)
- **TMA SDK**: `@tma.js/sdk-react` (dynamic-imported inside `TelegramAutoLogin`)
- **Chain tooling**: `viem` + `permissionless`
- **Smart accounts**: ZeroDev Kernel v3.1 + EntryPoint 0.7
  (`@zerodev/sdk`, `@zerodev/ecdsa-validator`, `@zerodev/permissions`)
- **Chain**: Avalanche Fuji (chain id 43113) — hard-coded in `src/utils/crypto.ts`
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.*`)
- **Bundling**: Vite with `vite-plugin-node-polyfills` (only `buffer`);
  `@solana/kit`, `@solana-program/system`, `@solana-program/token` are marked
  external in `build.rollupOptions` to avoid pulling in Privy's optional Solana
  peer deps; `permissionless` must stay bundled (not external).

## Project Layout
```
src/
├── main.tsx                       # Privy + SmartWallets providers + TelegramAutoLogin
├── App.tsx                        # Top-level router: auth gate → request dispatcher
├── index.css                      # Tailwind entry + TMA safe-area body padding
├── telegram.d.ts                  # Global Telegram WebApp + CloudStorage types
├── components/
│   ├── TelegramAutoLogin.tsx      # Silent loginWithTelegram on TMA mount
│   ├── ApprovalOnboarding.tsx     # Spending-limit grant UI (aegis_guard subtype)
│   ├── StatusView.tsx             # Tabbed home orchestrator + TabDock
│   ├── HomeTab.tsx                # Portfolio + delegation status
│   ├── ConfigsTab.tsx             # Wallet/agent addresses, permissions, disconnect
│   ├── DebugTab.tsx               # Console log viewer (uses useDebugEntries)
│   ├── SigningRequestModal.tsx    # Manual sign fallback UI (used by SignHandler)
│   ├── atomics/
│   │   ├── icons.tsx              # ShieldIcon (size/variant), GoogleIcon
│   │   ├── spinner.tsx            # Spinner (xs/sm/md/lg), LoadingSpinner (page)
│   │   └── FullScreen.tsx         # FullScreen, FullScreenLoading/Error/Success
│   ├── handlers/                  # AuthHandler, SignHandler, ApproveHandler
│   └── views/
│       └── login.tsx              # Full-screen login prompt
├── hooks/
│   ├── privy.ts                   # usePrivyToken — caches getAccessToken()
│   ├── useRequest.ts              # Reads ?requestId=… and fetches /request/:id
│   ├── useFetch.ts                # Generic authed-GET hook (used by StatusView tabs)
│   ├── useDebugEntries.ts         # Global console.log/warn interceptor + hook
│   └── useDelegatedKey.ts         # Session-keypair state machine (start/unlock/remove)
├── types/
│   └── miniAppRequest.types.ts    # All request/response DTOs (single source of truth)
└── utils/
    ├── crypto.ts                  # Keypair gen, AES-GCM, ZeroDev session-key install
    ├── telegramStorage.ts         # CloudStorage wrapper + localStorage dev fallback
    ├── loggedFetch.ts             # fetch() with [API] console tracing
    ├── postResponse.ts            # Typed POST to backendUrl/response
    └── toErrorMessage.ts          # unknown → string helper
```

Planning documents live under `constructions/` (one `.md` per feature rollout) —
treat them as historical plans, not sources of truth.

## Environment Variables

| Variable | Purpose |
| -------- | ------- |
| `VITE_PRIVY_APP_ID` | Privy application ID |
| `VITE_BACKEND_URL`  | Backend HTTP API base URL (no trailing slash) |
| `VITE_ZERODEV_RPC`  | ZeroDev bundler RPC — used for `publicClient` + bundler transport |
| `VITE_PAYMASTER_URL`| ZeroDev paymaster RPC — optional; enables gas sponsorship in `createSessionKeyClient` |

All are read via `import.meta.env` and narrowed with `?? ''` at the call site.
There is **no** `.env.example`; values come from whoever runs the dev server.

## Entry Wiring (`main.tsx`)
- Calls `Telegram.WebApp.ready()`, `.expand()`, and sets header/background to
  `#0f0f1a` **before** React mounts — matches the app background to prevent
  flashes inside the TMA frame.
- Providers, in order: `StrictMode > PrivyProvider > SmartWalletsProvider >
  { TelegramAutoLogin, App }`.
- `PrivyProvider` config:
  - `loginMethods: ['google', 'telegram']`
  - `appearance.theme: 'dark'`, `accentColor: '#7c3aed'`
  - `embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'`

## Top-Level Flow (`App.tsx`)

The app is a **single-route URL-driven dispatcher**. Branching order:

1. `!ready` → `<LoadingSpinner />`.
2. `!authenticated || !privyToken`
   - Inside Telegram *and* `tmaLoginTimedOut === false` → `<LoadingSpinner />`
     (give `TelegramAutoLogin` up to `TMA_AUTO_LOGIN_TIMEOUT_MS = 4000` ms).
   - Else → `<LoginView />`.
3. No `requestId` → `<StatusView />` (the auth-gated status/config/debug page).
4. `requestLoading` → spinner; `requestError` → `<ErrorView />`.
5. Dispatch on `request.requestType`: `auth` → `AuthHandler`, `sign` →
   `SignHandler`, `approve` → `ApproveHandler`. Unknown → `<ErrorView />`.

Session-key auto-bootstrap (after auth, before dispatch):
- Guarded by `autoKeyStartedRef` so it only runs once.
- **Skipped entirely for `auth` requests** — `AuthHandler` calls `start()`
  itself once the backend returns `approveRequestId`.
- Inside Telegram *and* no `requestId` → `delegatedKey.start()` (create if
  missing).
- Anywhere else → `delegatedKey.unlock()` (restore-only; no popup).

## Typed Request/Response Contract

`src/types/miniAppRequest.types.ts` is the **only** source of truth for the
TMA ↔ backend protocol. Every handler and response posts flow through this file.

```ts
RequestType    = 'auth' | 'sign' | 'approve'
ApproveSubtype = 'session_key' | 'aegis_guard'
```

- `AuthRequest` → `{ telegramChatId }`
- `SignRequest` → `{ to, value (wei dec string), data (0x), description,
  autoSign }`
- `ApproveRequest` → `{ subtype, suggestedTokens?, reapproval?, tokenAddress?,
  amountRaw? }`

Responses go to `POST {backendUrl}/response` via `postResponse()`; the response
shape mirrors the request type (`AuthResponse`, `SignResponse`,
`ApproveResponse`).

## Backend HTTP Endpoints (consumed by FE)

| Method & Path | Used by |
| -------- | ------- |
| `GET  /request/:requestId`              | `useRequest` |
| `POST /response`                         | `postResponse` |
| `GET  /portfolio`                        | `StatusView` (home tab) |
| `GET  /delegation/grant`                 | `StatusView` (configs tab permissions list) |
| `POST /delegation/grant`                 | `ApprovalOnboarding` (confirm spending limits) |
| `GET  /delegation/approval-params`       | `ApprovalOnboarding` (on mount; forwards `tokenAddress` + `amountRaw` query when present) |

All authenticated calls use `Authorization: Bearer ${privyToken}`.
Error handling: treat `!r.ok` as failure; surface status code in UI. 404/410 on
`/request/:id` map to `"Request not found or expired"` / `"Request expired"`.

## Handlers

### `AuthHandler`
Three-step effect chain, each guarded by its own `useRef` to prevent StrictMode
double-fires:
1. POST auth response → gets back optional `approveRequestId`.
   `telegramChatId` prefers `Telegram.WebApp.initDataUnsafe.user.id` over
   `request.telegramChatId`.
2. If `approveRequestId` returned, call `startDelegatedKey()` once the state is
   `idle`.
3. When `delegatedKeyState.status === 'done'`, POST approve response with
   `subtype: 'session_key'` + `delegationRecord`.
4. On `allDone`, call `Telegram.WebApp.close()` after 1500 ms (fixed pattern —
   all success states close the TMA this way).

### `SignHandler`
- `autoSign === true`: await `serializedBlob`, build a ZeroDev session client
  with `createSessionKeyClient`, `sendTransaction({ chain: null })`, POST
  `{ txHash }`, close TMA. Fallback: 10 s timer → show manual modal.
- Manual path: render `<SigningRequestModal />`. The modal's `approve` uses
  `useSmartWallets().client` (owner EOA, *not* the session key) to send the tx.
- Reject path always POSTs `{ rejected: true }` and calls `.close()`.

### `ApproveHandler`
- `subtype === 'session_key'`: auto-triggers `startDelegatedKey()`, POSTs
  the delegation record, closes on success. Success/processing/error UI lives
  inline in the component (shield icon, spinner, red error text).
- `subtype === 'aegis_guard'`: renders `<ApprovalOnboarding />` (spending-limit
  onboarding). `ApprovalOnboarding` reads `tokenAddress` + `amountRaw` from
  **props only** — it never reads the URL.

## `useDelegatedKey` Conventions
- **Deterministic seed** — the keypair blob is AES-GCM encrypted with
  `privyDid` as the PBKDF2 password. No user prompt, ever.
- **Storage key** is the constant `STORAGE_KEY = "delegated_key"` in
  Telegram CloudStorage (see `telegramStorage.ts` for the localStorage fallback).
- **State machine**: `idle | processing{step} | done{record} | error{message}`.
- `start()` is idempotent: checks CloudStorage first; decrypt-on-hit, create +
  install-on-chain + encrypt on miss. Decryption failure falls through to
  create (typical cause: user re-created the Privy account).
- `unlock()` is restore-only — never generates, never triggers a Privy popup.
  Stale/undecryptable blobs are cleared and state drops to `idle`.
- `removeKey()` wipes CloudStorage and transitions to `error` with a
  "reload to create a new one" message.
- `updateBlob(newBlob)` re-encrypts + persists without regenerating the
  keypair — used by downstream flows that reinstall on-chain permissions.
- User-rejection detection: `(err.code === 4001)` or
  `err.message.includes('User rejected')`.
- Exposes both `serializedBlob` state (re-renders) and a `serializedBlobRef`
  (synchronous access inside async callbacks) — **deliberate**, so SSE/auto-sign
  consumers can observe the update while async code keeps its latest value.
- `DEFAULT_PERMISSIONS` in this file is a placeholder (native AVAX, ~30 days,
  1 × 10¹⁸). Real per-token limits flow through `ApprovalOnboarding` →
  `POST /delegation/grant`.

## `utils/crypto.ts` Conventions
- **Never** use `installSessionKeyWithErc20Limits` — it was removed in the
  frictionless delegation refactor (2026-04-22). Only `installSessionKey`
  (sudo policy) exists now. Per-token limits are enforced **server-side**, not
  on-chain.
- AES-GCM blob layout (base64-encoded): `[16 salt][12 iv][ciphertext]`,
  PBKDF2-SHA256 @ 100 000 iters. `encryptBlob` / `decryptBlob` are the only
  API. Don't hand-roll.
- Session-key install path: `privy embedded provider → viem WalletClient →
  toOwner → signerToEcdsaValidator → toECDSASigner(empty account, addr only)
  → toPermissionValidator({ policies: [toSudoPolicy({})] }) →
  createKernelAccount({ plugins: { sudo, regular } }) →
  serializePermissionAccount(account, sessionPrivateKey)`.
- **The serialized blob contains the session private key.** Store only in
  CloudStorage (encrypted). **Never** send it to the backend.
- `createSessionKeyClient` paymaster wiring: pass `paymasterUrl` to get a
  sponsored `KernelAccountClient`; omit to pay gas from the SCA balance.

## Styling Conventions
- **Background**: `bg-[#0f0f1a]` for full-screen pages; `bg-[#161624]` or
  `bg-[#16162a]` for surface cards; `bg-white/5` / `bg-white/[0.04]` for
  inline rows.
- **Borders**: `border border-white/10` (cards), `border-white/[0.08]`
  (subtle), `border-violet-500/20` (accent/focused).
- **Brand accent**: violet-500/600 (`#7c3aed`) with indigo-600 (`#4f46e5`)
  gradients; success emerald-400 (`#34d399`); warning amber-500; error
  red-400/500.
- **Shield + checkmark icon** is the Aegis logo motif — reused across login,
  approval success, `ApprovalOnboarding`, and `AuthHandler` success. Use the
  same SVG shape and a per-instance `linearGradient id` (e.g. `auth-ok-shield`,
  `shield-onboard`) because React renders several on-screen.
- **Full-screen layout**: `flex flex-col items-center justify-center w-full
  min-h-dvh bg-[#0f0f1a] px-6 gap-N`. Use `min-h-dvh` (dynamic viewport)
  everywhere so Telegram's collapsible WebApp resizes correctly.
- **Spinner**: `w-8 h-8 rounded-full border-2 border-violet-500/20
  border-t-violet-500 animate-spin` (small variants exist; keep the same
  colours).
- **Labels**: `text-[10px] font-semibold tracking-widest text-white/30
  uppercase` for section captions throughout.
- **Safe areas**: `index.css` already applies `env(safe-area-inset-*)` to
  `body` — component code shouldn't re-add this.
- Prefer Tailwind arbitrary values (`text-[11px]`, `bg-white/[0.04]`) over
  config extensions. No `tailwind.config.*` exists.

## Telegram WebView Conventions
- `window.Telegram?.WebApp?.initData` presence is the canonical check for
  "running inside Telegram" — see `isInsideTelegram()` in `App.tsx` and the
  guards in `TelegramAutoLogin`.
- All success flows close the TMA via `window.Telegram?.WebApp?.close()`,
  usually after a 1500 ms "Taking you back to Telegram…" screen.
- CloudStorage is version-gated: anything below WebApp v6.9 (or absent) uses
  the localStorage mock installed in `telegramStorage.ts` at module load time.
  Do not call `CloudStorage` APIs directly — go through `cloudStorageGetItem /
  SetItem / RemoveItem`.
- `TelegramAutoLogin` is **silent** by design: it never surfaces errors to the
  UI, logs only in `import.meta.env.DEV`, and exits early on any guard
  failure so `LoginView` can still render for manual login. `loginWithTelegram`
  is runtime-available but sometimes missing from the Privy types — the
  `@ts-ignore` at the destructure is intentional until upstream types ship.

## Logging & Debug Conventions
- Use the `loggedFetch(url, init)` wrapper for every backend call — it emits
  `[API] → METHOD URL` / `[API] ← STATUS body` to the console so it shows up in
  the Debug tab and copy-log flow.
- `DebugLog.tsx` monkey-patches `console.log` / `console.warn` at module load
  and captures only lines containing `[AEGIS:` into an in-memory ring buffer
  (cap 200). **Non-`[AEGIS:` logs pass through untouched.** To surface a log
  in the Debug tab, prefix with `[AEGIS:<namespace>]`.
- Existing informal tags in the codebase: `[Delegation]`, `[SignHandler]`,
  `[TelegramAutoLogin]`, `[ApproveHandler]`, `[API]`. Keep using these.
- Dev-only UI (e.g. "Wipe CloudStorage" button in `ApprovalOnboarding`) is
  gated behind `import.meta.env.DEV`.

## Coding Conventions (this app)
- React 19, function components only, default export only at `App.tsx` and
  `main.tsx`; every other export is named.
- Refs are used aggressively to guard against StrictMode double-fires and to
  prevent re-entry on single-shot effects (`hasStartedRef`, `attemptedRef`,
  `authPostedRef`, etc.). New effects with side effects follow the same
  pattern.
- `eslint-disable-next-line react-hooks/exhaustive-deps` is acceptable on
  effects that are intentionally locked to a subset of deps — keep the
  disable narrowly scoped and add a comment if non-obvious.
- Type-level: `0x${string}` for addresses / hex; raw-integer amounts are
  `string` over the wire and `BigInt` at call sites (`BigInt(request.value)`).
- Async IIFEs (`(async () => { … })()`) inside `useEffect` are preferred over
  returning a promise; never mark the effect itself `async`.
- Error mapping: `toErrorMessage(err)` when displaying; otherwise narrow with
  `err instanceof Error`.
- Prefer small sibling helpers and avoid new folders — `src/utils` and
  `src/components` are flat by convention (except `atomics/`, `handlers/`,
  `views/`).

## Build & Scripts (`package.json`)
- `dev`        — `vite`
- `build`      — `vite build`
- `typecheck`  — `tsc -b` (project-refs; runs `tsconfig.app.json` +
  `tsconfig.node.json`)
- `lint`       — `eslint .` (flat config at `eslint.config.js`)
- `preview`    — `vite preview`
- `overrides.ox: 0.14.5` — pinned to resolve a Privy/viem transitive mismatch.
  Don't bump without checking Privy's peer range.

## Known Invariants / Gotchas
- **Chain is hard-coded to Avalanche Fuji** in `crypto.ts`. Any multi-chain
  support requires threading `chain` through `installSessionKey`,
  `createSessionKeyClient`, and the wallet/public clients.
- **Privy token refresh** is the caller's responsibility — `usePrivyToken`
  fetches once on `authenticated` flip; long-lived sessions may see stale
  tokens. Re-mount or call `getAccessToken()` if a 401 bounces back.
- `useRequest` reads `requestId` from `window.location.search` at mount and
  does **not** re-run on URL changes — the TMA lifecycle is one request per
  open.
- `SmartWalletsProvider` must wrap `App` (and `TelegramAutoLogin`, which
  happens to sit outside but doesn't use smart wallets) — `useSmartWallets()`
  throws otherwise.
- The frictionless-delegation refactor (2026-04-22) removed:
  `PasswordDialog`, `AegisGuardToggle`, `AegisGuardModal`, `useAegisGuard`,
  `installSessionKeyWithErc20Limits`, `Erc20SpendingLimit`, and the
  `password`-based blob encryption path. Do not reintroduce these names.
- The dead-code cleanup (2026-04-23) removed:
  `SigningApprovalModal`, `signingInterceptor`, `decodeEip712`,
  `DelegationDebugPanel`, `ErrorView` (replaced by `FullScreenError`), and
  the unused `Keypair` / `AegisGrant` / duplicate `DelegationRecord` type
  exports. Do not reintroduce these — the signing-interception EIP-712
  preview flow is not wired in; bring it back as a new module if needed.

## Shared UI Atoms (post-2026-04-23 refactor)
Prefer these over inline JSX — a handful of handlers previously duplicated
full-screen layouts, spinners, and shield SVGs 5+ times each.

- `components/atomics/spinner.tsx`
  - `<Spinner size="xs|sm|md|lg" className?>` — inline spinner (default violet).
  - `<LoadingSpinner />` — full-screen page loader.
- `components/atomics/icons.tsx`
  - `<ShieldIcon size? variant="violet|success" />` — gradient id is generated
    with `useId()` so multiple shields co-exist without clashing.
  - `<GoogleIcon />` — Google G mark.
- `components/atomics/FullScreen.tsx`
  - `<FullScreen>` — the `min-h-dvh bg-[#0f0f1a] px-6 gap-4` page wrapper.
  - `<FullScreenLoading step? />` — centred spinner + optional step text.
  - `<FullScreenError message showClose? />` — red centred message, optional
    "Close" button that calls `Telegram.WebApp.close()`.
  - `<FullScreenSuccess title subtitle? />` — post-success card with shield,
    "Closing automatically" line. **Caller is responsible for triggering the
    actual `Telegram.WebApp.close()`** — this component only renders UI.

## Fetch Hook Convention
`hooks/useFetch.ts` is the canonical auth'd-GET hook for JSON APIs.
Accepts a nullable URL (returns idle when null/disabled), optional
`transform(body)` for shape adaptation, and a user-facing `errorMessage`.
`HomeTab` (portfolio) and `ConfigsTab` (permissions list) both use it —
do not re-implement the fetch → `setLoading`/`setError`/`setData` dance
inline.

## Debug Log Interceptor (moved to hooks/)
`hooks/useDebugEntries.ts` installs the `console.log` / `console.warn`
monkey-patch at module load (captures only lines containing `[AEGIS:`,
ring buffer cap 200). `DebugTab` renders the entries. Import the hook,
not a "DebugLog component" — the latter was removed.

## 2026-04-23 — ConfigsTab permissions field alignment
`GrantPermission` type and `GrantRow` were reading `symbol` / `maxAmount` /
`spent` off the `/delegation/grant` response, but the BE contract
(`TokenDelegation` in `be/.../tokenDelegation.repo.ts`) uses `tokenSymbol`,
`limitRaw`, `spentRaw`, `tokenDecimals`. The mismatch left the spending-limit
cell rendering "—" for every grant. Renamed the FE fields to match, and
`GrantRow` now scales `limitRaw` / `spentRaw` by `tokenDecimals` via BigInt
before formatting (raw values are bigint strings over the wire, not
human-readable amounts). **Convention**: when surfacing delegation rows, always
divide `limitRaw`/`spentRaw` by `10 ** tokenDecimals` — never display raw.

## 2026-04-23 — tab-switch refetch fix (global AppData store)
`HomeTab` and `ConfigsTab` each called `useFetch` directly, so every tab switch
unmounted the consumer and re-fired `GET /portfolio` / `GET /delegation/grant`.
Hoisted both fetches into `src/hooks/useAppData.tsx`:
- `AppDataProvider` wraps `StatusView`'s tab area (mounted once, survives tab
  switches) and owns both `useFetch` calls.
- Consumers call `usePortfolio()` / `useDelegations()` — same
  `{ data, loading, error }` shape as `useFetch` so no call-site logic changed.
- Parsers (`parsePortfolio`, `parseGrants`) and shared types (`PortfolioToken`,
  `GrantPermission`) now live in `useAppData.tsx` as the single source of truth;
  the per-tab copies were deleted.
- `HomeTab` / `ConfigsTab` no longer take `backendUrl` or `privyToken` props —
  they read from context.

**Convention**: shared cross-tab backend data belongs in `AppDataProvider`.
Add new endpoints by extending `AppData` + exposing a `useXxx()` selector;
do not call `useFetch` inline in a tab that can be unmounted by `TabDock`.
Refreshing after mutations (e.g. after `POST /delegation/grant` in
`ApprovalOnboarding`) is **not** yet wired — provider lifetime ≈ one
authenticated session; a `refetch()` on the resource is the right extension
point when that becomes a requirement.
