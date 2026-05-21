# Privy Auth Mini-App — Status Log

Telegram Mini App (TMA) for **Aegis** onchain AI agent. Privy auth (Google + Telegram auto-login), ERC-4337 smart-wallet, ZeroDev session-key delegation, typed request/response bridge to Aegis backend.

---

## Tech Stack

- React 19 / Vite 8 / TypeScript strict
- Privy v3 (`@privy-io/react-auth`) — **no `/smart-wallets`** (we derive SCA ourselves)
- `@tma.js/sdk-react` (dynamic-imported in `TelegramAutoLogin`)
- `viem` + `permissionless` ^0.2
- ZeroDev Kernel v3.1 + EntryPoint 0.7 (`@zerodev/sdk`, `@zerodev/ecdsa-validator`, `@zerodev/permissions`) — kept only for contract bindings; infra is Pimlico
- Multi-chain: Avalanche 43114 (home), Fuji 43113, BSC 56, Polygon 137 — resolved via `utils/chainConfig.ts` (`CHAIN_REGISTRY`)
- Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.*`)
- `overrides.ox: 0.14.5` pinned for Privy/viem transitive — do not bump blindly

## Project Layout

```
src/
├── main.tsx                 # PrivyProvider + TelegramAutoLogin (NO SmartWalletsProvider)
├── App.tsx                  # Router: auth gate → request dispatcher (or StatusView)
├── components/
│   ├── TelegramAutoLogin.tsx
│   ├── ApprovalOnboarding.tsx       # Spending-cap grant UI (aegis_guard + session_key)
│   ├── BscDelegationModal.tsx       # Per-chain top-up install
│   ├── StatusView.tsx               # TabDock: home/activity/points/configs
│   ├── HomeTab.tsx                  # Portfolio + YieldPositions + PredictionPositions
│   ├── ActivityTab.tsx              # Transfer history (Ankr-backed)
│   ├── PointsTab.tsx
│   ├── ConfigsTab.tsx
│   ├── PredictionPositions.tsx
│   ├── ClosePositionSheet.tsx
│   ├── YieldPositions.tsx
│   ├── SigningRequestModal.tsx      # Manual sign fallback
│   ├── atomics/                     # BottomSheet, icons, spinner, FullScreen
│   ├── activity/                    # TransferRow, DirectionFilter
│   ├── handlers/                    # AuthHandler, SignHandler, ApproveHandler,
│   │                                # OnrampHandler, YieldDepositHandler, dispatchSign
│   └── views/login.tsx
├── hooks/
│   ├── privy.ts                     # usePrivyToken
│   ├── useRequest.ts
│   ├── useFetch.ts                  # supports refetchOnVisible + stable refetch()
│   ├── useAppData.tsx               # portfolio/grants/yield/pm-positions/config
│   ├── useTransferHistory.ts
│   ├── useLoyalty.ts
│   └── useDelegatedKey.ts
├── types/
│   ├── miniAppRequest.types.ts      # SSOT for DTOs
│   ├── transferHistory.types.ts
│   └── predictionMarket.types.ts
└── utils/
    ├── chainConfig.ts               # CHAIN_REGISTRY + per-chain helpers + Polymarket addrs
    ├── aaConfig.ts                  # Pinned AA constants — MUST mirror be/aaConfig.ts
    ├── deriveScaAddress.ts          # Counterfactual SCA derivation
    ├── createSudoClient.ts          # Manual-sign Kernel client (Privy EOA)
    ├── crypto.ts                    # Keypair gen, AES-GCM, session-key install
    ├── encryptedCloudStorage.ts     # AES-GCM+PBKDF2 JSON wrappers
    ├── cloudStorageKeys.ts          # Registry of all per-protocol secret keys
    ├── sessionEoa.ts                # Decrypts blob to access raw privKey
    ├── polymarket.ts                # CLOB submit + helpers (no FE order builder)
    ├── eoaTxClient.ts               # Chain-agnostic EOA viem walletClient
    ├── interpretSignError.ts        # Stable SignErrorCode union
    ├── telegramStorage.ts           # CloudStorage + 15s timeout + chunking
    ├── bigintRevive.ts
    ├── recentBroadcasts.ts          # Two-layer dedupe (in-mem + localStorage v2)
    ├── loggedFetch.ts / resilientFetch.ts / fetchNextRequest.ts / postResponse.ts
    └── logger.ts                    # createLogger; warn/error → sonner toasts
```

`constructions/*.md` are historical plans, not SSoT.

## Environment Variables

Core: `VITE_PRIVY_APP_ID`, `VITE_BACKEND_URL`, `VITE_CHAIN_ID` (default 43114), `VITE_LOG_LEVEL`.

Per chain (home + each extra `<CHAIN>` in `{POLYGON,BSC,...}`):
`VITE_<CHAIN>_RPC_URL`, `VITE_<CHAIN>_PIMLICO_PAYMASTER_URL`, `VITE_<CHAIN>_PIMLICO_SPONSORSHIP_POLICY_ID`.

**Bundler URLs are no longer FE env vars.** `getBundlerUrl(chainId)` returns `${VITE_BACKEND_URL}/aa/bundler/<chainId>` — the BE proxies Pimlico (see "AA bundler proxy" below). `VITE_<CHAIN>_PIMLICO_BUNDLER_URL` removed.

Optional: `VITE_ONBOARDING_CHAIN_IDS` (comma-separated override for eager install set).

**RPC must NOT be bundler-only** — viem crashes on bundler-revert envelopes. Pimlico's `/v2/<chainId>/rpc` is fine (it proxies standard RPC).

---

## Typed Request/Response Contract

`src/types/miniAppRequest.types.ts` is the **only** source of truth.

```ts
RequestType    = 'auth' | 'sign' | 'approve' | 'onramp'
ApproveSubtype = 'session_key' | 'aegis_guard'
SignKind       = 'yield_deposit' | 'yield_withdraw'  // routes to YieldDepositHandler
```

- `SignRequest` carries `primitive?: 'userop' | 'eoa_tx' | 'eip712'` (absent = userop for legacy). EIP-712 carries `domain`/`types`/`primaryType`/`message`; BE serialises BigInts as decimal strings, FE revives via `bigintRevive.ts`.
- `SignResponse` on failure: `{ rejected: true, errorCode?, errorMessage? }` with `errorCode` from `interpretSignError`. Codes are stable — extend in lockstep with BE.
- `OnrampRequest.walletAddress` is the SCA, **not** the EOA.

## Backend HTTP Endpoints (consumed)

`GET /request/:id` (+ `?after=` for chained steps), `POST /response`, `GET /portfolio`, `GET /yield/positions`, `GET /delegation/grant`, `POST /delegation/grant`, `POST /delegation/revoke`, `GET /delegation/approval-params`, `GET /loyalty/{balance,history,leaderboard}`, `GET /transfers`, `GET /predictionMarket/positions`, `GET /predictionMarket/positions/:id/previewClose`, `POST /predictionMarket/positions/:id/close`.

All authed calls send `Authorization: Bearer ${privyToken}` (omitted on first `auth` fetch and on leaderboard). 404/410 → "not found"/"expired".

---

## Top-Level Flow (`App.tsx`)

1. `!ready` → spinner.
2. `!authenticated` → spinner (in TMA, until `tmaLoginTimedOut` after 4s) else `<LoginView />`.
3. No `requestId` → `<StatusView />`.
4. Dispatch on `request.requestType`: `auth` → `AuthHandler`, `sign` → `SignHandler` (or `YieldDepositHandler` when `kind === 'yield_*'`), `approve` → `ApproveHandler`, `onramp` → `OnrampHandler`.

Session-key auto-bootstrap guarded by `autoKeyStartedRef`. Skipped for `auth` (AuthHandler runs `start()` itself). Inside TMA + no `requestId` → `delegatedKey.start()`; else `unlock()` (restore-only, no popup).

---

## Handlers

### `AuthHandler`
Three ref-guarded steps: POST auth response → if `approveRequestId`, synthesize a minimal `ApproveRequest` (`subtype: 'session_key'`) and render `<ApprovalOnboarding>` (which drives install + per-chain `POST /delegation/grant` + `POST /response`). **Do not silently install** — caps must be user-consented before grant.

### `SignHandler`
Single FE entry point for every queued sign request, regardless of primitive. `dispatchSign` branches on `primitive`:
- `userop` → cached `KernelAccountClient.sendTransaction` (per-chainId `Map<number, ...>` cache; **clear before chaining next step** to avoid stale-validator simulation revert `0xe52970aa`).
- `eoa_tx` → `eoaTxClient.sendEoaTx(privKey, to, data, value, chainId)`.
- `eip712` → `privateKeyToAccount(...).signTypedData(req.domain, req.types, req.message)` then per `purpose`: `clob_auth` POSTs to `/auth/api-key` and saves creds to encrypted CloudStorage; `polymarket_order` loads creds and POSTs `/order` to `clob.polymarket.com` with HMAC headers.

Auto-sign chains via `fetchNextRequest(backendUrl, requestId)` (6×400ms 404-retry, then close on 404). Manual fallback uses `<SigningRequestModal />` + `createSudoClient`.

`SigningRequestModal` renders typed-data summary for `eip712`. Takes `keyStatus` prop; only arms 10s fallback when `keyStatus !== 'processing'` (Rule 5).

### `YieldDepositHandler`
Single file, `mode: 'deposit' | 'withdraw'`. Auto-open-and-sign when `autoSign && serializedBlob`. Falls back to pre-sign confirm screen with `displayMeta` and a `createSudoClient` manual send. No fallback timer on blob.

### `ApproveHandler`
- `session_key` → auto `startDelegatedKey()`, POST delegation record, close.
- `aegis_guard` → `<ApprovalOnboarding />` (reads `tokenAddress`/`amountRaw` from props only — never URL).

### `OnrampHandler`
Auto-invokes `useFundWallet().fundWallet({...asset:'USDC'})`. Subscribes to `onUserExited` and only treats `FundResult.status: 'submitted' | 'confirmed'` as success — promise resolution alone is ambiguous (modal cancel also resolves). New `'cancelled'` screen with Try-again button.

---

## `useDelegatedKey` Conventions

- **Deterministic seed** — keypair AES-GCM encrypted with `privyDid` as PBKDF2 password. No prompt ever.
- Storage key `delegated_key` in Telegram CloudStorage. Payload: `{ privateKey, address, blobs: Record<chainId, blob>, installedChainIds: number[] }`. Legacy single-`blob` still decodes (assumed home chain).
- State machine: `idle | processing{step} | done{record} | error{message}`.
- `start()` idempotent; `unlock()` restore-only; `removeKey()` performs **full revoke**:
  1. **Onchain invalidation** — per-chain sudo Kernel client → `uninstallSessionKey` (uninstallPlugin userOp). Independent per chain.
  2. **Backend revoke** — `POST /delegation/revoke` (clears Redis + token_delegations, flips `sessionKeyStatus = REVOKED`).
  3. **Local wipe** + `wipeAllManagedSecrets()` (walks `cloudStorageKeys.ts` registry).

  Requires `backendUrl` + `privyToken` opts (threaded from `App.tsx`). Without token, skip onchain step (BE clear + local wipe still run).
- `updateBlob(newBlob)` re-encrypts without regenerating.
- Exposes both `serializedBlob` state **and** `serializedBlobRef` (sync access in async callbacks) — deliberate.
- Multi-chain: `useDelegatedKey({ chainIds })` installs same keypair on each chain sequentially. Eager onboarding defaults to `getOnboardingChainIds()`.

## `utils/crypto.ts` Conventions

- Only `installSessionKey` exists (sudo policy). `installSessionKeyWithErc20Limits` removed — never reintroduce. Per-token limits enforced **server-side**.
- AES-GCM blob: `[16 salt][12 iv][ciphertext]`, PBKDF2-SHA256 @ 100k iters. Use `encryptBlob`/`decryptBlob` only.
- All chain-aware: `createSudoClient(provider, eoa, chainId)`, `createSessionKeyClient(blob, chainId, privyToken)`, `installSessionKey(provider, eoa, sk, addr, chainId)`, `uninstallSessionKey(... chainId, privyToken)`. **Bundler/paymaster URLs come from registry — old URL-param forms are gone.**
- `privyToken` is always the last positional arg on any kernel-client builder — registers a per-host `Authorization: Bearer <token>` injector via `rpcTrace.registerHeaderInjector(url, () => headers)` for the BE-proxied bundler.
- `serializedBlob` contains the session private key. Never send to backend.

## `useDelegatedKey` ↔ `sessionEoa.ts` coupling

`sessionEoa.ts` decrypts the same blob shape `useDelegatedKey` writes to get the raw EOA privKey (needed for Polymarket signatureType=EOA signing). **If blob format changes, both files move together.**

---

## Critical Rules — Sign Flow (DO NOT VIOLATE)

Source: hard-won fixes 2026-04-24. Read before touching `SignHandler`, `YieldDepositHandler`, or any new auto-signing handler.

### Three request classes
1. `autoSign: true` — execute silently via session key. Do not prompt user.
2. `autoSign: false` — explicit confirmation; `SigningRequestModal` + sudo client.
3. `auth` / `approve` — separate handlers; drive `delegatedKey.start()` themselves.

### Rule 1: auto-sign failures MUST NOT pop manual modal
Same SCA + chain + paymaster — manual would fail identically and submit a second doomed userOp. Render full-screen error view with raw selectable text + diagnostics (`bundler:set|MISSING`, etc.) + Close.

### Rule 2: `SigningRequestModal` is only for `autoSign: false`
Modal uses `createSudoClient` (Privy EOA, no Pimlico paymaster). Never a fallback for an auto-sign path expecting sponsorship.

### Rule 3: Pimlico — one URL for bundler and paymaster
Both can point at the same Pimlico per-chain endpoint; keep as two env vars for independent override. (Bundler now goes through BE proxy — see below.)

### Rule 4: `autoSignError` must stay surfaced
Never `setAutoSignError(null)` without also clearing `autoSignAttemptedRef.current`. Must be in a copyable view (Telegram clips overlays).

### Rule 5: `serializedBlob === null` is not terminal
Pair with `delegatedKey.state.status`: `processing` → wait indefinitely; `idle`/`error` no blob → arm 10s fallback OK; `done` with blob → execute. Any new auto-sign handler **must** take `keyStatus` prop.

### Rule 6: Broadcast dedupe is two-layered — both required
Without it, BE re-emits + StrictMode + effect re-fire cause double-send draining wallet. Two layers in `utils/recentBroadcasts.ts`, **keyed by `requestId`** (was `(to,value,data)`; v2 LS key drops stale entries):
- `trackInFlightBroadcast(requestId, send)` — in-memory `Map<requestId, Promise<hash>>`; coalesces concurrent.
- `findRecentBroadcast(requestId)` + auto-`recordBroadcast` on success — localStorage `aegis.recentBroadcasts.v2`, 10min TTL.

Order in handler: check `findRecentBroadcast` first; else `trackInFlightBroadcast(...)`. Never call `recordBroadcast` directly.

### Pre-ship checklist (new sign-capable handler)
- [ ] `autoSign:true` uses `createSessionKeyClient` per-chainId.
- [ ] Auto-sign errors render persistent error view, not modal.
- [ ] `autoSign:false` uses `SigningRequestModal` + `createSudoClient`.
- [ ] Consumes `keyStatus`; waits on `processing`.
- [ ] Logs `[AEGIS:<HandlerName>]` prefix.
- [ ] No hardcoded chain — use `utils/chainConfig.ts` registry.

---

## Standing Conventions

### Logging (per CLAUDE.md)
- `const log = createLogger('ModuleNameInCamelCase')`. Never raw `console.*`.
- Signature: `log.level('message', metadataObj)` (opposite of pino).
- `warn`/`error` surface as Sonner toasts; `debug`/`info` console-only.
- Step pattern on handlers: `log.info('step', { step: 'started'|'submitted'|'succeeded'|'failed', requestId })`.
- Network: request `→` at debug, response `←` at debug, retry at debug, exhaustion at warn.
- Privacy — never log: `privyToken`, `initData`, `serializedBlob`, `privyDid`, signatures, CLOB creds. Truncate via `token.slice(0,8)+'…'`.
- Module logger scopes in use: `placeBetHandler`, `closePositionHandler`, `BscDelegationModal`, `ApprovalOnboarding`, `telegramStorage`.

### Chain-agnostic
Anything chain-specific lives in `utils/chainConfig.ts` (`CHAIN_REGISTRY`, Polymarket addrs via `getPolymarketAddresses(chainId)`, helpers `getChainById`/`getRpcUrlById`/`getBundlerUrl`/`getPaymasterUrl`/`getSponsorshipPolicyId`/`isSupportedChain`/`getOnboardingChainIds`). **Never inline chain IDs, RPC URLs, or addresses elsewhere.**

### AA stack
`utils/aaConfig.ts` (entry point 0.7, Kernel V3.1, `index = 0n`) **MUST mirror `be/src/helpers/aaConfig.ts` byte-for-byte.** Manual-sign goes through `createSudoClient` — never reintroduce `@privy-io/react-auth/smart-wallets` or `useSmartWallets()`. (`useFundWallet`, `usePrivy`, `useWallets`, `loginWithTelegram` still come from the base SDK.)

### Cross-feature endpoints
List endpoints return `{ <feature>: <Item>[] }`, not bare arrays (mirrors `/yield/positions`, `/predictionMarket/positions`). Parser narrows on `Array.isArray(body.X)` and returns `[]` otherwise.

### `useFetch`
Supports `refetchOnVisible: true` for state the BE owns that the FE just mutated. Returns stable `refetch()` callback for explicit re-pulls. **Never poll free-tier-backed endpoints** (Ankr today) — use a `Refresh` button. **429 is a non-error UX state** — dedicated `rateLimited` flag, banner, warn-level log only.

### CloudStorage
All access through `cloudStorageGetItem/SetItem/RemoveItem` in `telegramStorage.ts` (localStorage mock at module load for non-TMA). Every callback wrapped in 15s timeout; values >3800 chars transparently chunked across `${key}_c${i}` with `__aegis_chunks_v1:<N>` manifest. Write order: chunks first, then manifest (torn writes never point at missing chunks). Manifest sentinel `__aegis_chunks_v1:` reserved.

Per-protocol secret keys **must register in `utils/cloudStorageKeys.ts`** so `removeKey`'s `wipeAllManagedSecrets()` catches them. CLOB creds live under `polymarket_clob_creds_<chainId>`; never travel to BE.

LocalStorage cache keys carry explicit version suffix (`aegis.<feature>.v<N>`). Bump on shape change.

### `sessionStorage.tabAfterSign`
Cross-reload tab-restore key. Any component triggering a `?requestId=` navigation from inside `StatusView` writes the active tab before `window.location.assign`; `StatusView` consumes-and-clears it on first mount.

### Privy modal handlers
Handlers wrapping a Privy modal (`fundWallet`, etc.) must treat the awaited promise as ambiguous — gate success on explicit signal (`onUserExited` + `FundResult.status` check). Promise resolution ≠ user paid.

### Styling
- BG `bg-[#0f0f1a]`; cards `bg-[#161624]` / `#16162a`; rows `bg-white/5` / `bg-white/[0.04]`.
- Borders `border-white/10`; accent `border-violet-500/20`.
- Brand violet-500/600 (`#7c3aed`) + indigo-600; emerald-400 success; amber-500 warn; red-400/500 error.
- Full-screen layout: `flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-N`. Always `min-h-dvh`.
- Spinner: `w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin`.
- Section labels: `text-[10px] font-semibold tracking-widest text-white/30 uppercase`.
- Safe areas on `body` in `index.css` — don't re-add. Bottom-fixed UI uses `pb-[max(env(safe-area-inset-bottom),1rem)]`.
- Prefer Tailwind arbitrary values; no `tailwind.config.*`.
- `BottomSheet` (`components/atomics/BottomSheet.tsx`) is the shared bottom-sheet primitive — reuse for any modal-confirm flow, do not fork per-feature.

### React / TS
- React 19 function components. Default export only at `App.tsx`/`main.tsx`.
- Refs guard StrictMode (`hasStartedRef`, `attemptedRef`, `authPostedRef`, …) on every single-shot effect.
- `0x${string}` for addresses/hex; raw amounts as `string` over wire, `BigInt(...)` at call site.
- Async IIFE in `useEffect`; never `async` the effect itself.
- Errors: `toErrorMessage(err)` for display; otherwise narrow with `err instanceof Error`.
- Flat dirs (`src/utils`, `src/components`) except `atomics/`, `handlers/`, `views/`, `activity/`.

### Telegram WebView
- `window.Telegram?.WebApp?.initData` presence = canonical inside-Telegram check.
- All success flows: `WebApp.close()` after 1500ms "Taking you back…" screen.
- `TelegramAutoLogin` silent (errors never surface, logs only in DEV). `loginWithTelegram` `@ts-ignore` is intentional.

---

## AA Bundler Proxy (2026-05-15)

FE → BE → Pimlico (no direct FE → Pimlico). `getBundlerUrl(chainId)` returns `${VITE_BACKEND_URL}/aa/bundler/<chainId>`. `privyToken` passed as last positional arg on every kernel-client builder; per-host header injector registered via `rpcTrace.registerHeaderInjector(url, () => headers)` (called per request so short-lived tokens rotate without re-registering).

**Why:** `eth_sendUserOperation` failed with `TypeError: Load failed` in Telegram Desktop's macOS WKWebView when userOp >~8KB. Same-origin BE proxy sidesteps the WKWebView quirk and removes Pimlico API key from FE bundle. Paymaster path unchanged (still direct).

Use `registerHeaderInjector` for any future authed-host need — do **not** introduce parallel fetch wrappers.

---

## Prediction Markets — Current State

One-click cutover landed 2026-05-20: `SignHandler` is the single FE entry; legacy FE bet state machines (`PlaceBetHandler`, `ClosePositionHandler`, `predictionMarketApi.ts` mutations, `polygonEoaClient.ts`, `deepLink.ts`, `predictionMarketConstants.ts`, paper-bet code) **all removed — do not reintroduce**.

- `primitive` (wire) is the only signing discriminator. `kind` is the yield/PM sub-classifier (orthogonal).
- All EIP-712 signing happens generically inside `dispatchSign` against BE-driven `req.domain`/`req.types`/`req.message`. **No FE-side Polymarket order builder.** `polymarket.ts` trimmed to read/submit surface + helpers (`POLYMARKET_ORDER_TYPES`, `POLYMARKET_CLOB_AUTH_TYPES`, `applySlippage`, `sharesForStake`, `randomSalt`, `submitPolymarketOrder`, `deriveClobApiKey`).
- CLOB creds live in encrypted CloudStorage under `polymarket_clob_creds_<chainId>` only — never to BE, never in logs.
- Position list: `HomeTab` mounts `<PredictionPositions />` (between `<YieldPositions />` and `<RecentTransfers />`). Tap row → `<ClosePositionSheet>` does preview + close, persists tab to `sessionStorage.tabAfterSign`, navigates `?requestId=<id>` so `SignHandler` drains the queue. Double-tap guarded by `submittingRef` + BE 409 path.
- Polygon (137) wired in `chainConfig.ts` with Polymarket addresses alongside via `getPolymarketAddresses(chainId)`.

**Known gap (verify before mainnet bets):** BE-side bridge-initiation endpoint pending; without it bets can dead-end at INITIATED.

---

## Multi-chain (BSC) for Aster Tokenized Stocks (2026-05-04)

Existing-user top-up: when `SignRequest.chainId` arrives for an uninstalled chain, `SignHandler` renders `BscDelegationModal` instead of auto-signing. User signs once → `installOnChain(chainId)` → auto-sign proceeds.

`ApprovalOnboarding` fetches `/delegation/approval-params?chainId=…` and POSTs `/delegation/grant` per chain sequentially (`{ delegations, chainId }`).

Sign-error codes added (lockstep with BE `notifyResolved.ts`): `aster_pair_inactive`, `aster_min_size`, `aster_max_position`, `aster_oracle_stale`, `aster_insufficient_collateral`, `stock_recovery_failed`. Adding any new code requires matching BE branch in same PR.

BSC venue revert recovery: no in-session recovery — BE emits fresh `mini_app` artifact for return swap; user closes failed mini-app and taps new chat prompt. FE needed zero new code for this.

---

## Self-Derived SCA (2026-05-03)

`useState`/`useEffect` driven by `deriveScaAddress(eoaAddress)`. **No `useSmartWallets`** — replaced by `createSudoClient` for manual-sign userOps. Privy's hosted product owned both Kernel constants and derivation; dashboard/SDK changes could silently change a user's SCA. By pinning AA stack in `aaConfig.ts` and deriving ourselves, FE cannot drift from BE.

`sudoClient` built lazily in a ref (not during render, not in `useEffect` on mount — provider isn't always ready before first interaction).

---

## Known Invariants / Gotchas

- Chain default is mainnet (43114). Add new chains to `CHAIN_REGISTRY` only.
- Privy token refresh is the caller's responsibility; `usePrivyToken` fetches once on `authenticated` flip. Long sessions may see stale tokens — re-mount or call `getAccessToken()` on 401 bounce.
- `useRequest` reads `requestId` once at mount. Chained swap steps use `fetchNextRequest` — URL stays fixed.
- `fetchNextRequest` keeps its own 6×400ms 404-retry for "BE creating next step" — distinct from `resilientFetch`'s 4× 250–2000ms 429/5xx backoff. Don't collapse.
- Stateless-routing invariant: zero use of cookies, `credentials: 'include'`, or server-issued opaque handles. Every request self-authenticates with `Authorization: Bearer <privyToken>`; `requestId` resolves on any replica via Redis. Violations require `// STATELESS-AUDIT: allowed because <reason>` + BE sticky-routing config.
- Loyalty: `pointsTotal` opaque string (never `Number()`); BE timestamps are **epoch seconds**; `nextCursor = createdAtEpoch` of last row or null; `hasMore = cursor != null` (never compare lengths). Action keys: `swap_same_chain`, `swap_cross_chain`, `send_erc20`, `yield_deposit`, `yield_hold_day`, `referral`, `manual_adjust`.
- Activity: transfer cursor is opaque string (provider-defined); don't parse or display. Page 0 resets on direction change.
- Delegation rows: divide `limitRaw`/`spentRaw` by `10 ** tokenDecimals` via BigInt — never display raw. Fields are `tokenSymbol`/`limitRaw`/`spentRaw`/`tokenDecimals` (not `symbol`/`maxAmount`/`spent`).
- Per-chain client caches: `Map<number, KernelAccountClient>` — never single ref. Drop chain's entry on "next swap step" invalidation, not all entries. All sign logs include `chainId`.
- No test runner; stateless-routing regression guard deferred until vitest.

---

## Removed — Do Not Reintroduce

- `SmartWalletsProvider` / `useSmartWallets` / `@privy-io/react-auth/smart-wallets` (2026-05-03)
- `installSessionKeyWithErc20Limits` / `Erc20SpendingLimit` / `PasswordDialog` / `AegisGuardToggle` / `AegisGuardModal` / `useAegisGuard` / password-based blob encryption (2026-04-22)
- `SigningApprovalModal`, `signingInterceptor`, `decodeEip712`, `DelegationDebugPanel`, `ErrorView` (replaced by `FullScreenError`) (2026-04-23)
- Paper-bet UX (`PaperBetHandler`, `pmApi.paperBet*`, all paper-bet types, `place_bet:` deep-link branch) (2026-05-15)
- Legacy PM handlers/utils: `PlaceBetHandler`, `ClosePositionHandler`, `predictionMarketApi.ts` mutations, `polygonEoaClient.ts`, `deepLink.ts`, `predictionMarketConstants.ts` (2026-05-20)
- `DebugTab` + `useDebugEntries` console interceptor (2026-05-05) — `utils/logger.ts` kept
- `useNotifications` / `RecentTransfers` BE-unbacked stub — superseded by ActivityTab. Use `useTransferHistory` pattern.
- Old bundler env vars `VITE_<CHAIN>_PIMLICO_BUNDLER_URL` (2026-05-15 — now BE-proxied)
- Old kernel-client URL parameters (bundler/paymaster URLs as args). All chain-id-aware now.

---

## Selected Reference (recent landings)

- **Onramp cancellation + send dedup rekey** (2026-05-05) — `onUserExited` + `FundResult.status` gate; `recentBroadcasts` keyed by `requestId` (v2 LS key).
- **Revoke flow rewrite** (2026-05-08) — onchain `uninstallPlugin` + BE `/delegation/revoke` + local wipe; each best-effort, all run.
- **First-login cap approval** (2026-05-09) — no more silent install. `AuthHandler` synthesizes `ApproveRequest` and renders `<ApprovalOnboarding>`. Non-stables stay reapproval-driven via `aegisGuardInterceptor` × `NON_STABLE_REAPPROVAL_MULTIPLIER` (default 10).
- **Delegations cache invalidation on disconnect** (2026-05-09) — `useFetch` exposes stable `refetch()`, threaded through `Resource<T>`; `ConfigsTab.handleRemove` calls `refetchDelegations()`.
- **Web2-friendly wording revamp** (2026-05-08) — wording-only pass: "agent"→"bot", "Approve"→"Allow", "Smart Account"→"Main Wallet", etc. Internal identifiers (status codes, log scopes, error codes) unchanged. `EXEC_STATUS_LABELS` / `SETUP_STEP_LABELS` maps colocated with state machine for TS exhaustiveness.
- **`interpretSignError` Relay solver classification** (2026-04-27) — `swap_amount_too_small`, `swap_amount_too_large`, `swap_no_liquidity` (ASCII + hex patterns).
- **AppDataProvider** (2026-04-23) — mounted once around `StatusView`; shared cross-tab data belongs here, not inline `useFetch` in tabs that `TabDock` can unmount. Selectors: `usePortfolio`, `useDelegations`, `useYieldPositions`, `usePmPositions`, `useAppConfig`.
