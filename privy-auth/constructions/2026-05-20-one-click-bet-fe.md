# One-click Polymarket bet — Frontend

Date: 2026-05-20
Status: plan
Supersedes: `fe/privy-auth/constructions/2026-05-15-zero-sign-bet-fe.md` (kept as historical record). That plan defined the end-state; this plan captures **what is already landed on the BE**, the matching FE gaps **still broken today**, and the slices to ship a true one-click `/bet` and `/close`.
Pair: `be/constructions/2026-05-20-one-click-bet-be.md`. Both ship together; BE Slice F flag flip is the cutover, paired with FE Slice 3 here.

## Why this plan, not just "follow 2026-05-15"

State of the FE as of 2026-05-20:

- `SignHandler.tsx` still treats every sign request as a UserOp (no `kind` switch). The BE has been writing `kind` / `purpose` / `eip712` / `eoa_tx` rows under `PREDICTION_MARKETS_USE_SIGN_QUEUE=true` since 2026-05-15.
- `PlaceBetHandler.tsx` (~580 LOC) and `ClosePositionHandler.tsx` are still the FE-driven state machines, driving per-step BE REST calls.
- `deepLink.ts:23` only matches `close_position` — the `place_bet` verb was deleted with paper-bets on 2026-05-15. So `?startapp=place_bet:<intentId>` (still emitted by `PlaceBetCapability`) **returns null from `parseDeepLink`**. Tapping Confirm opens the mini-app and **no handler mounts**. This is the user-visible "one-click is broken" symptom today.
- `App.tsx:114-124` routes `deepLink.kind === 'close_position'` → `ClosePositionHandler`; everything else falls through to a generic loader.
- `polymarket.ts` carries `signOrder`, `signClobAuth`, `buildUnsignedOrder`, `deriveClobApiKey`, full HMAC submission stack.
- `predictionMarketApi.ts` carries the full FE-driven state-machine API: `setupStep`, `transitionBet`, `placeOrder`, `sellOrder`, `finalizeBet`, `recordRefund`, `driftDetected`, `bridgeStatus`, `orderbook`.
- `polygonEoaClient.ts` has `sendEoaTx` (Polygon-hardcoded) + `sweepUsdcToSca`.

What's needed from the FE for one-click to work:

1. `SignHandler` learns to dispatch on `kind`. Existing `userop` path is unchanged; new `eoa_tx` and `eip712` branches added.
2. `eip712 purpose='clob_auth'` signs ClobAuth typed data, calls `/auth/api-key` on Polymarket CLOB **FE-side**, and persists the returned credentials to encrypted CloudStorage.
3. `eip712 purpose='polymarket_order'` signs the Order typed data, calls `/order` on Polymarket CLOB **FE-side** with FE-held HMAC creds, reports the resulting `polymarketOrderId` back in `/response`.
4. `App.tsx` mounts `SignHandler` for the generic "mini-app open with no start_param" case (the new BE contract under the flag). Deep-link verbs `place_bet` and `close_position` are dropped.
5. `PlaceBetHandler.tsx`, `ClosePositionHandler.tsx`, the mutation half of `predictionMarketApi.ts`, and the signing half of `polymarket.ts` get deleted.

Out of scope: revisiting BLOCKER-2 (`privyDid` as encryption password — CLOB creds inherit the same fix when it lands) and BLOCKER-3 (`maxUint256` approvals on the EOA — handled by a follow-up BE plan that swaps `enqueueSetupApprovals` to per-bet exact approvals).

## Outcome

```
chat (confirm tap)
mini-app opens with no start_param (or with /sign-mode start_param — see §1)
SignHandler mounts → fetchNextRequest → dispatchSign on `kind`:
   'userop'   → kernel client UserOp                       (existing path, untouched)
   'eoa_tx'   → viem walletClient.sendTransaction          (new)
   'eip712'   → privateKeyToAccount(...).signTypedData     (new)
                purpose='clob_auth'        → POST /auth/api-key → save creds locally
                purpose='polymarket_order' → POST /order with HMAC headers → orderId
postResponse → fetchNextRequest → loop until empty → mini-app closes
```

`PlaceBetHandler.tsx`, `ClosePositionHandler.tsx`, the bet-orchestration FE API, and the signing half of `polymarket.ts` are gone. The mini-app surface for prediction-market flows is the same `SignHandler` as `/send` and `/swap`.

## Convention adherence (no new mechanisms)

| Concern | Existing convention reused |
|---|---|
| Mini-app entry URL | `?requestId=<id>` — same as `/send` / `/swap`. No new query param, no new deep-link verb. BE plan §0 builds the URL with the id `advance()` returned. |
| Sign request chaining | `fetchNextRequest(backendUrl, currentRequestId, privyToken)` polling `/request/:id?after=:id` — already in `utils/fetchNextRequest.ts`. |
| App.tsx routing | Existing `switch (request.requestType)` mounts `SignHandler` for `'sign'`. Slice 3 deletes the two `deepLink` branches; no new mode added. |
| Auto-sign loop | Existing `SignHandler.tsx` effect at line 144+. Slice 0 refactors only — same outer loop. |
| Error reporting | Existing `interpretSignError` + `buildErrorRaw` + `extractViemErrorContext.ts`. Add a `redactCredFields` helper inside the existing pipeline — do not invent a parallel error path. |
| EOA tx signing | Existing `polygonEoaClient.ts:sendEoaTx` — generalised to `eoaTxClient.ts:sendEoaTx(privKey, to, data, value, chainId)`. Same `viem` `walletClient.sendTransaction`. |
| Typed-data signing | Existing `viem` `privateKeyToAccount(...).signTypedData`. The `eip712` branch is just a call site for it; no new crypto helper. |
| CloudStorage encryption | Existing AES-GCM + PBKDF2 (used by `delegated_key`). Slice 1 factors `encryptJson` / `decryptJson` into `utils/encryptedCloudStorage.ts` if not already — pure extraction, not a new scheme. |
| CloudStorage key registration | Slice 1 introduces `utils/cloudStorageKeys.ts` for the central registry so `removeKey` wipes all of them. This is the **one** new convention worth introducing — it has direct precedent in the existing single-key wipe and prevents a known footgun. |
| Manual-confirm modal | Existing `SigningRequestModal`. Slice 4 extends its render for typed-data; same modal component, no new modal stack. |

If the implementation drifts toward a new artifact kind, a new BE endpoint, or a new deep-link verb for the queue-driven bet flow, push back. The bootstrap is `?requestId=`. Everything else is internal to `dispatchSign`.

## Non-custodial invariants (must hold)

1. Session-key privkey never leaves `sessionEoa.ts` scope. It's only passed to `viem` signing/RPC helpers locally.
2. CLOB credentials (`apiKey`, `secret`, `passphrase`) live only in encrypted CloudStorage and in-memory derivations inside `submitPolymarketOrder`. They never travel to BE. **Not** in logs, **not** in toasts, **not** in `errorRaw` posted to BE.
3. Every EIP-712 signature is produced FE-side and either (a) submitted to a third-party endpoint (Polymarket CLOB) FE-side, or (b) returned to BE solely as proof-of-completion. BE recovers the signer locally and discards.
4. `interpretSignError` and the auto-sign fallback do not include raw signatures or CLOB creds in `errorRaw`. Add explicit redaction filter.

## Design

### 1. App.tsx cleanup (Slice 3) — purely deletions

App.tsx routing today (`fe/privy-auth/src/App.tsx:113-147`):

```tsx
} else if (deepLink && delegatedKey.state.status === 'done') {
  content = <ClosePositionHandler positionId={deepLink.positionId} ... />;
} else if (deepLink) {
  content = <LoadingSpinner />;
}
...
switch (request.requestType) {
  case 'sign': { return <SignHandler request={request} ... />; }
  ...
}
```

The `request.requestType === 'sign'` branch **already** mounts `SignHandler` for any BE-enqueued sign request — it's how `/send` and `/swap` work today. Slice 3 is purely a deletion: remove the two `deepLink` branches and the imports.

```tsx
// After Slice 3 — no deep-link branches for prediction-market verbs:
switch (request.requestType) {
  case 'sign': { return <SignHandler request={request} ... />; }
  case 'auth': { return <AuthHandler ... />; }
  case 'approve': { return <ApproveHandler ... />; }
  case 'onramp': { return <OnrampHandler ... />; }
}
```

`useRequest` bootstrap (`fe/.../hooks/useRequest.ts:16`) already reads `?requestId=` from the URL — same path `/send` and `/swap` use. The BE plan's §0 wires the chat URL to `${MINI_APP_URL}?requestId=${firstSignRequestId}` for the queue-driven flow, so no new bootstrap path is needed on the FE side.

`deepLink.ts` becomes dead code after the App.tsx branches go. Either:

- **(a)** delete `deepLink.ts` and `types/predictionMarket.types.ts:DeepLinkAction` entirely, OR
- **(b)** keep returning `null` for compatibility.

Pick (a). Grep `parseDeepLink` / `DeepLinkAction` / `deepLink.ts` and confirm zero remaining callers after deleting the two handlers.

> Convention adherence: this slice **adds no new FE entry path**. The mini-app continues to bootstrap from `?requestId=` and chain via `fetchNextRequest('/request/:id?after=:id')`. The `SignHandler` dispatcher extension (§3) is the only behaviour change.

### 2. `SigningRequest` typed union (Slice 0)

`fetchNextRequest` today returns a `SignRequest` shape with `to / value / data` and an optional `kind` (yield discriminator). Extend the union with the new primitive discriminator:

```ts
// fe/privy-auth/src/types/signRequest.ts (new file)

export type SignPrimitive = 'userop' | 'eoa_tx' | 'eip712';
export type Eip712Purpose = 'clob_auth' | 'polymarket_order';

interface BaseSignRequest {
  requestId: string;
  chainId: number;
  autoSign: boolean;
}

interface UseropSignRequest extends BaseSignRequest {
  primitive?: 'userop';   // absent for legacy rows; defaults to userop
  kind?: 'yield_deposit' | 'yield_withdraw';
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
  displayMeta?: YieldDisplayMeta;
}

interface EoaTxSignRequest extends BaseSignRequest {
  primitive: 'eoa_tx';
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
}

interface Eip712SignRequest extends BaseSignRequest {
  primitive: 'eip712';
  purpose: Eip712Purpose;
  domain: { name?: string; version?: string; chainId?: number; verifyingContract?: `0x${string}`; salt?: string };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;   // BigInts arrive as decimal strings
  expiresAt: string;                   // ISO; FE refuses to sign past this
  betId?: string;
  positionId?: string;
}

export type SignRequest = UseropSignRequest | EoaTxSignRequest | Eip712SignRequest;
```

`fetchNextRequest`'s return type widens to `SignRequest`. Existing reads of `to / value / data` get narrowed by a `req.primitive === 'userop' || req.primitive === 'eoa_tx'` guard. Treat missing `primitive` as `'userop'` for backwards compatibility (legacy rows).

The BE wire field is `primitive` (the BE type already uses this name to disambiguate from the yield `kind` field — see `be/.../miniAppRequest.types.ts:54`). Mirror it verbatim.

### 3. `dispatchSign` extraction (Slice 0 + 1)

Refactor `SignHandler.tsx`'s effect body (~lines 144-375) so the only branch on `primitive` is the signing primitive. Extract:

```ts
// fe/privy-auth/src/components/handlers/dispatchSign.ts (new file)

export async function dispatchSign(
  req: SignRequest,
  eoa: SessionEoa,
  getSessionClient: (chainId: number) => Promise<SessionClient>,
  privyToken: string,
): Promise<DispatchResult> {
  if ((req.primitive ?? 'userop') === 'userop') {
    const sc = await getSessionClient(req.chainId);
    const hash = await trackInFlightBroadcast(req.requestId, () =>
      sc.sendTransaction({
        to: req.to, value: BigInt(req.value), data: req.data,
        account: sc.account!, chain: null,
      })
    );
    return { kind: 'userop', hash };
  }

  if (req.primitive === 'eoa_tx') {
    const hash = await sendEoaTx(eoa.privateKey, req.to, req.data, BigInt(req.value), req.chainId);
    return { kind: 'eoa_tx', hash };
  }

  // eip712
  if (new Date(req.expiresAt) < new Date()) {
    throw new SignRequestExpired(req.requestId);
  }
  const account = privateKeyToAccount(eoa.privateKey);
  const signature = await account.signTypedData({
    domain: req.domain,
    types: req.types,
    primaryType: req.primaryType,
    message: bigintRevive(req.message, req.types, req.primaryType),
  });

  if (req.purpose === 'polymarket_order') {
    const creds = await loadClobCreds(req.chainId);
    if (!creds) throw new Error('CLOB credentials missing — setup did not complete');
    const polymarketOrderId = await submitPolymarketOrder({
      order: { ...req.message, signature },
      creds,
      apiBase: getPolymarketClobApi(),
    });
    return { kind: 'eip712', signature, signer: account.address, polymarketOrderId };
  }

  // purpose='clob_auth'
  const creds = await deriveClobApiKey(getPolymarketClobApi(), {
    signer: account.address,
    timestamp: String(req.message.timestamp),
    nonce: String(req.message.nonce),
    signature,
  });
  await saveClobCreds(req.chainId, creds);
  return { kind: 'eip712', signature, signer: account.address };
}

export type DispatchResult =
  | { kind: 'userop' | 'eoa_tx'; hash: Hex }
  | { kind: 'eip712'; signature: Hex; signer: Address; polymarketOrderId?: string };
```

`SignHandler` becomes:

```ts
const result = await dispatchSign(currentRequest, eoa, getSessionClient, privyToken);
await postResponse(backendUrl, privyToken, buildResponseBody(currentRequest, result));
await reportTxHashIfApplicable(result);   // userop/eoa_tx only
const next = await fetchNextRequest(...);
if (next) chainTo(next); else close();
```

Failure semantics match the existing userop path: try once, on throw run `interpretSignError`, set `autoSignError`, POST a typed error to BE so the error-catalog can react (drift, BET_IN_FLIGHT). Manual-confirm fallback is unchanged for `userop`; for `eoa_tx` it shows the same `to/value/data` modal; for `eip712` it shows a typed-data summary (`primaryType` + domain.name).

`buildResponseBody`:

```ts
function buildResponseBody(req: SignRequest, r: DispatchResult): SignResponse {
  const base = { requestId: req.requestId, requestType: 'sign' as const };
  if (r.kind === 'userop' || r.kind === 'eoa_tx') return { ...base, txHash: r.hash };
  return { ...base, signature: r.signature, signer: r.signer, polymarketOrderId: r.polymarketOrderId };
}
```

### 4. CLOB credentials in encrypted CloudStorage (Slice 1)

```ts
// fe/privy-auth/src/utils/clobCreds.ts (new file)

interface ClobCreds { apiKey: string; secret: string; passphrase: string; }

const KEY = (chainId: number) => `polymarket_clob_creds_${chainId}`;

export async function saveClobCreds(chainId: number, creds: ClobCreds): Promise<void> {
  const password = await getSessionKeyPassword();   // same source as delegated_key
  const blob = await encryptJson(creds, password);
  await cloudStorageSetItem(KEY(chainId), blob);
}

export async function loadClobCreds(chainId: number): Promise<ClobCreds | null> {
  const blob = await cloudStorageGetItem(KEY(chainId));
  if (!blob) return null;
  const password = await getSessionKeyPassword();
  return decryptJson<ClobCreds>(blob, password);
}

export async function wipeClobCreds(): Promise<void> {
  for (const cid of Object.keys(CHAIN_REGISTRY).map(Number)) {
    await cloudStorageRemoveItem(KEY(cid));
  }
}
```

Refactor the AES-GCM + PBKDF2 routine used by `delegated_key` into `utils/encryptedCloudStorage.ts` (`encryptJson` / `decryptJson`) if it's not already.

`useDelegatedKey.removeKey` calls `wipeClobCreds()` alongside the existing `delegated_key` wipe. Order: onchain revoke → BE revoke → wipe `delegated_key` → wipe CLOB creds. All best-effort, all logged.

New convention to record in fe/privy-auth/status.md after Slice 1: **CloudStorage keys are listed in one place (`utils/cloudStorageKeys.ts` if not already) and `useDelegatedKey.removeKey` wipes every entry on disconnect.** Prevents future per-protocol creds blobs silently surviving disconnect.

### 5. `submitPolymarketOrder` (Slice 2)

```ts
// fe/privy-auth/src/utils/polymarket.ts (additions)

export async function submitPolymarketOrder(opts: {
  order: PolymarketOrderArtifact;
  creds: ClobCreds;
  apiBase: string;
}): Promise<string /* polymarketOrderId */> {
  const body = JSON.stringify({ order: opts.order, owner: opts.creds.apiKey, orderType: 'GTC' });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await hmacSign(opts.creds.secret, `${ts}POST/order${body}`);
  const r = await fetch(`${opts.apiBase}/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      POLY_ADDRESS:    opts.order.maker,
      POLY_SIGNATURE:  sig,
      POLY_TIMESTAMP:  ts,
      POLY_API_KEY:    opts.creds.apiKey,
      POLY_PASSPHRASE: opts.creds.passphrase,
    },
    body,
  });
  if (!r.ok) throw new Error(`CLOB /order → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { orderID?: string; errorMsg?: string };
  if (!j.orderID) throw new Error(`CLOB rejected order: ${j.errorMsg ?? 'unknown'}`);
  return j.orderID;
}

export async function deriveClobApiKey(apiBase: string, auth: {
  signer: string; timestamp: string; nonce: string; signature: string;
}): Promise<ClobCreds> {
  const r = await fetch(`${apiBase}/auth/api-key`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      POLY_ADDRESS:    auth.signer,
      POLY_SIGNATURE:  auth.signature,
      POLY_TIMESTAMP:  auth.timestamp,
      POLY_NONCE:      auth.nonce,
    },
  });
  if (!r.ok) throw new Error(`CLOB /auth/api-key → ${r.status}`);
  const j = await r.json() as ClobCreds & { errorMsg?: string };
  if (!j.apiKey || !j.secret || !j.passphrase) {
    throw new Error(`CLOB rejected auth: ${j.errorMsg ?? 'unknown'}`);
  }
  return { apiKey: j.apiKey, secret: j.secret, passphrase: j.passphrase };
}
```

`hmacSign` is HMAC-SHA256 with `creds.secret` base64-decoded as the key, output base64url. Implementation in `utils/hmac.ts` using `crypto.subtle.sign('HMAC', ...)` (works in Telegram Desktop / iOS / Android WebViews; smoke-test on all three during slice 2).

The function is fire-and-forget from `SignHandler`'s perspective: returns an order id (success → response body) or throws (error → existing error path posts typed error to BE).

### 6. `sendEoaTx` parameterisation (Slice 1)

Today's `sendEoaTx(privateKey, to, data)` in `polygonEoaClient.ts` is Polygon-hardcoded. Generalise:

```ts
export async function sendEoaTx(
  privateKey: Hex,
  to: Address,
  data: Hex,
  value: bigint = 0n,
  chainId: number,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  const chain = getChainById(chainId);
  const client = createWalletClient({ account, chain, transport: http(getRpcUrlById(chainId)) });
  return client.sendTransaction({ to, data, value });
}
```

Rename the file from `polygonEoaClient.ts` → `eoaTxClient.ts`. `sweepUsdcToSca` was only consumed by the deleted handlers; remove it.

### 7. EIP-712 message BigInt revival (Slice 2)

BE serializes BigInts as decimal strings inside `message`. Revive per-field type before `account.signTypedData`:

```ts
function bigintRevive(
  message: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>,
  primary: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of types[primary] ?? []) {
    const v = message[field.name];
    if (field.type.startsWith('uint') || field.type.startsWith('int')) {
      out[field.name] = BigInt(v as string);
    } else if (types[field.type]) {
      out[field.name] = bigintRevive(v as Record<string, unknown>, types, field.type);
    } else {
      out[field.name] = v;
    }
  }
  return out;
}
```

Snapshot test against the Polymarket `Order` and `ClobAuth` typed-data shapes to confirm wire-format round-trips.

### 8. Files deleted (Slice 3)

- `fe/privy-auth/src/components/handlers/PlaceBetHandler.tsx`
- `fe/privy-auth/src/components/handlers/ClosePositionHandler.tsx`
- `fe/privy-auth/src/components/handlers/predictionMarketConstants.ts` *(constants either move to BE env-driven values BE sends, or get inlined into BE enqueue helpers)*
- Most of `fe/privy-auth/src/utils/predictionMarketApi.ts` — keep only `state` / `positions` / `bet` / `intent` if chat-side or debug-tab still wants them. Rename to `pmReadApi.ts`. Delete mutation methods: `setupStep`, `transitionBet`, `placeOrder`, `sellOrder`, `finalizeBet`, `recordRefund`, `driftDetected`, `bridgeStatus`, `orderbook`.
- `IllegalTransitionError`, `BetInFlightError` (no longer surfaced by BE in the new shape; drift becomes a chat message).
- From `polymarket.ts`: `signOrder`, `signClobAuth`, `buildUnsignedOrder`, `clientOrderIdFromSalt`. Keep domain/types constants + `applySlippage` + `sharesForStake` + `randomSalt` + new `submitPolymarketOrder` / `deriveClobApiKey`.
- `polygonEoaClient.ts` → renamed `eoaTxClient.ts`; `sweepUsdcToSca` deleted.
- `deepLink.ts` (if no remaining consumers) + the `place_bet` / `close_position` cases in `App.tsx`.

### 9. Files added (Slice 1–2)

- `fe/privy-auth/src/types/signRequest.ts` — typed union (§2)
- `fe/privy-auth/src/components/handlers/dispatchSign.ts` — extracted dispatcher (§3)
- `fe/privy-auth/src/utils/clobCreds.ts` (§4)
- `fe/privy-auth/src/utils/hmac.ts` (HMAC-SHA256 / base64url, `crypto.subtle`)
- `fe/privy-auth/src/utils/encryptedCloudStorage.ts` *(if not already factored)* — `encryptJson` / `decryptJson` helpers reused by `delegated_key` and `polymarket_clob_creds_*`

### 10. Logging additions

Per CLAUDE.md FE logging rules; `SignHandler` already follows the convention. Additions:

```ts
log.info('step', { step: 'started', requestId, primitive: req.primitive, purpose: req.purpose });
log.debug('eip712 signed', { requestId, signer: account.address });    // never the signature
log.info('step', { step: 'submitted', requestId, polymarketOrderId: result.polymarketOrderId });
log.warn('clob-creds-missing', { requestId, chainId });
log.warn('sign-request-expired', { requestId, expiresAt: req.expiresAt });
log.warn('hmac-platform-unsupported', { platform });   // defensive — crypto.subtle missing
```

Privacy: `errorRaw` body must scrub `secret`, `passphrase`, `apiKey`, and `signature` before being POSTed to `/response`. Add a `redactCredFields(err)` helper called from the existing `buildErrorRaw` in `extractViemErrorContext.ts`.

### 11. Manual-confirm fallback (Slice 4)

`SignHandler`'s manual-confirm path today builds a `SigningRequestModal` showing `to / value / data`. For `eoa_tx`, the same modal works (same fields). For `eip712`, render a different summary: "Sign typed data: domain={name}, primaryType={primaryType}". Power-user view shows the JSON. Pressing Allow runs `account.signTypedData` and the same FE-side post-processing. For `polymarket_order`, run the CLOB submission too — skipping it would orphan a signed order; surface CLOB failures via the normal error path.

This path should not be reachable in production (bet flows are always `autoSign: true`), but the code must not crash if it ever is — defensive only.

## Tasks (shippable slices)

Slice 0 — type widening + dispatcher refactor (no behaviour change while BE still emits only `userop`):

1. Widen `SignRequest` type; add `primitive` to fetch/parse; default `'userop'` when absent.
2. Extract `dispatchSign` from the existing `SignHandler.tsx` effect body. Only `userop` branch implemented.
3. Unit tests: `dispatchSign` with synthetic `userop` request returns expected shape.

Slice 1 — `eoa_tx` and `eip712 purpose='clob_auth'`:

4. `sendEoaTx` parameterisation (chainId, value); rename file to `eoaTxClient.ts`; delete `sweepUsdcToSca`.
5. `clobCreds.ts` + `hmac.ts` + encryption helper extraction.
6. `dispatchSign` `eoa_tx` branch + `eip712 clob_auth` branch (clob creds saved locally).
7. Update `useDelegatedKey.removeKey` to wipe clob creds. Cloud-storage key registry.

Slice 2 — `eip712 purpose='polymarket_order'` + CLOB submission:

8. `submitPolymarketOrder` + `deriveClobApiKey` in `polymarket.ts`.
9. `dispatchSign` order branch (load creds, submit, attach orderId).
10. `bigintRevive` + snapshot test against the Polymarket Order + ClobAuth typed-data shapes.
11. Smoke-test HMAC submission on iOS / Android / Desktop Telegram WebViews.

Slice 3 — handler/route deletion (PAIRED with BE Slice F — single deploy):

12. Delete `PlaceBetHandler.tsx`, `ClosePositionHandler.tsx`.
13. Trim `predictionMarketApi.ts` → `pmReadApi.ts`.
14. Trim `polymarket.ts` to constants + new submitters.
15. Drop `place_bet` / `close_position` branches from `App.tsx` + `parseDeepLink`. Delete `deepLink.ts` if no remaining consumer.
16. `fe/privy-auth/status.md` entry.

Slice 4 — manual-confirm support for new kinds (defensive):

17. Extend `SigningRequestModal` to render `eip712` summary.
18. Extend manual path in `SignHandler` to handle non-userop primitives.

Each slice is independently revertable. Slice 0 is a pure refactor. Slices 1–2 are gated by the BE actually emitting the new kinds — they can ship dark. Slice 3 is the user-visible cutover; ship together with BE Slice F-1 flag flip. Slice 4 can ship any time after Slice 2.

## Risks + mitigations

- **`sendEoaTx` requires the EOA to hold MATIC.** Mitigation: setup chain enqueues a `userop` that funds the EOA before any `eoa_tx` is issued (BE plan §4). FE's `eoa_tx` branch surfaces "out of gas" via existing `interpretSignError` mapping.
- **CLOB submission failure between FE-sign and BE `/response`.** Mitigation: `submitPolymarketOrder` is part of `dispatchSign`'s `polymarket_order` path. If CLOB rejects, throw → existing error path → BE marks the bet `FAILED { clob_rejected }` → sweep refunds. No order lost (nothing submitted) and no order duplicated (FE never posted `/response { polymarketOrderId }`).
- **Mini-app closed after CLOB submit but before `/response { polymarketOrderId }`.** Mitigation: post `/response` BEFORE `dispatchSign` returns. If `/response` fails, retry once with backoff before throwing (same pattern as `reportTxHash`). Worst case: order is live, BE doesn't know about it → fill-timeout → bet marked `UNFILLED` → sweep runs — but the order may actually have filled. Document this edge in fe/STATUS.md after Slice 2; recovery probe (BE polls Polymarket for "any orders by this proxy / salt") is a follow-up.
- **Signature scope confusion / replay.** Mitigation: BE sets `expiresAt` < 60s on order signs; FE refuses to sign past it; BE refuses `/response` past it. Stuck-bet sweeper re-enqueues with a fresh `expiresAt` if the mini-app never opened in time.
- **CloudStorage encryption keyed on `privyDid`.** Acknowledged. Tracked under BLOCKER-2. Once that lands, CLOB creds inherit the fix.
- **HMAC signing in a WebView.** `crypto.subtle.sign('HMAC', …)` is available in TG Desktop / iOS / Android WebViews. Slice 2 includes smoke-tests on all three platforms.
- **`findRecentBroadcast` dedupe collisions.** Today's keyed by `requestId`. New `eoa_tx` / `eip712` rows have unique `requestId`s so no collision. But: the residual-sweep `eoa_tx` row issued after a partial fill has a fresh `requestId` — make sure dedupe doesn't latch onto the previous bet's row. Verify via slice-2 integration test (two consecutive bets within 60s).

## Acceptance

- `/bet $5 yes` → chat confirm tap → mini-app opens → no taps → closes within ≤30s on first bet, ≤10s on subsequent. Verified on iOS / Android / TG Desktop.
- `/bet $5 yes` followed by force-quit of TG → reopen mini-app 5 minutes later → bet completes without duplication.
- `/close` confirm tap → mini-app opens → no taps → closes ≤10s. Position transitions `open → closing → closed`.
- Disconnect bot → CloudStorage no longer contains `delegated_key` or `polymarket_clob_creds_137`. Verified via DebugTab.
- `grep -rn "privateKey\|secret\|passphrase\|apiKey\|signature" fe/privy-auth/src/utils/pmReadApi.ts fe/privy-auth/src/components/handlers/` (after Slice 3) returns no production-code references in handlers. Only `polymarket.ts`, `clobCreds.ts`, `hmac.ts`, `submitPolymarketOrder` legitimately reference them.
- `errorRaw` posted to BE on a failed bet sign contains no signature material (integration test that mocks `/response`).
- DebugTab shows no Sonner toast during the bet flow (auto-sign success path is silent, matching `/send`).
- Drift > BE-configured threshold: BE chat posts the friendly message; mini-app sees no queued request; closes immediately.
- Manual-confirm fallback (defensive, `autoSign: false` injected for test) renders the eip712 summary modal and successfully submits to CLOB on Allow.

## fe/privy-auth/status.md updates after each slice

- Slice 0: append "SignHandler dispatcher refactor — `dispatchSign` extracted, `primitive` union typed; backwards-compatible no-op."
- Slice 1: append "`eoa_tx` + `eip712 clob_auth` primitives live behind BE flag. `clobCreds.ts` + `hmac.ts` + `encryptedCloudStorage.ts` added. `useDelegatedKey.removeKey` wipes CLOB creds. Convention: CloudStorage keys centralised in `utils/cloudStorageKeys.ts`; all per-protocol blobs registered there."
- Slice 2: append "`polymarket_order` primitive live. FE submits directly to clob.polymarket.com via HMAC; BE never sees CLOB creds or signatures. Snapshot tests for ClobAuth + Order typed-data."
- Slice 3: top-of-file entry "Prediction markets — one-click cutover — 2026-MM-DD". List deleted handlers (`PlaceBetHandler`, `ClosePositionHandler`), deleted types (`IllegalTransitionError`, `BetInFlightError`, `DeepLinkAction`), trimmed `polymarket.ts` + `predictionMarketApi.ts`, dropped `parseDeepLink` verbs. Note BLOCKER-2 inheritance + BLOCKER-3 follow-up.
- Slice 4: append "Manual-confirm fallback handles `eoa_tx` and `eip712` defensively; production path remains auto-sign-only."
