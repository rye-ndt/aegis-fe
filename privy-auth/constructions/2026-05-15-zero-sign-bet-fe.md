# Zero-sign Polymarket bets — Frontend

Date: 2026-05-15
Status: plan
Pair: `be/constructions/2026-05-15-zero-sign-bet-be.md`. Both plans ship together; the BE-side schema migration ships first and is backwards-compatible until this FE lands.

## Why

The `/send` and `/swap` flows are auto-sign through `SignHandler` — the user taps once in chat, the mini-app opens, every step runs without interaction, and it closes. The `/bet` flow is a separate, much larger handler (`PlaceBetHandler.tsx`, ~580 lines, plus `ClosePositionHandler.tsx`, plus its own API layer and Polymarket utility module) that drives the BE rather than being driven by it.

The two patterns can be unified. With BE-side changes (see paired plan), bet steps become entries in the existing `sign_request` queue. `SignHandler` learns two extra signing primitives and one extra outbound HTTP target (Polymarket CLOB), and `PlaceBetHandler` / `ClosePositionHandler` disappear.

Non-custodial constraint must hold throughout: the session-key private key, the Polymarket CLOB credentials, and every signature stay on the device. BE never sees them.

## Outcome

```
chat (confirm bet) → BE enqueues sign_request → user taps deep-link
mini-app opens → SignHandler picks up the request → dispatches on `kind`:
  • 'userop'  → existing path: build UserOp, send via session-key kernel client
  • 'eoa_tx'  → new path:      sign + broadcast a raw Polygon tx with the EOA privkey
  • 'eip712'  → new path:      signTypedData with the EOA privkey; for purpose
                               'polymarket_order' also POST the signed order to
                               clob.polymarket.com directly using FE-held HMAC
                               creds; report polymarketOrderId back to BE.
→ report response → fetchNextRequest() (same chain loop as /swap)
→ no more requests → close.
```

No bet-specific React components survive. Bet-specific util code (`polymarket.ts`) is reduced to the EIP-712 domain/types tables, which `SignHandler` consumes only as data — they arrive in the sign-request body.

## Scope (in / out)

In scope:

- `SignHandler` dispatcher: switch on `request.kind` (default `'userop'` for backwards compatibility while BE migration is in flight).
- New helpers: `signEoaTx`, `signEip712` (thin wrappers around `viem` primitives, using the in-memory session-key privkey).
- New helper: `submitPolymarketOrder` (FE → CLOB POST with FE-held HMAC creds).
- CLOB credential storage: encrypted CloudStorage key `polymarket_clob_creds_<chainId>` parallel to `delegated_key`. Read/write helpers, wiped by `useDelegatedKey.removeKey`.
- Delete `PlaceBetHandler.tsx`, `ClosePositionHandler.tsx`, `predictionMarketApi.ts` (except read-only `state` / `positions` / `bet` if chat-side still needs them — moved to a `pmReadApi.ts` shrunk file).
- Reduce `polymarket.ts` to: `buildDomain`, `ORDER_TYPES`, `CLOB_AUTH_DOMAIN`, `CLOB_AUTH_TYPES`, `applySlippage`, `sharesForStake`, `randomSalt`, `submitOrderToClob`, `deriveClobApiKey`. Drop `signOrder`, `signClobAuth`, `buildUnsignedOrder` (BE builds the message; FE just signs whatever arrives).
- `App.tsx` mount-branch cleanup: drop the bet/close-position branches; the generic SignHandler mount handles them.
- DeepLinkAction stays at `close_position` only (or removed entirely if nothing else uses it; verify with grep).

Out of scope:

- Visual changes to chat result-cards. Cards still come from BE; the mini-app just gets generic SignHandler chrome.
- Manual-confirm mode for bet sign-requests. Bet flows are always `autoSign: true`. If `autoSign: false` ever shows up on an `eip712` row, fall through to the existing manual modal — but that's a defensive code path, not a feature.
- Onboarding flow for Polygon session-key install. The existing `ApprovalOnboarding` / `BscDelegationModal` cross-chain prompt covers "this chain isn't installed yet"; Polygon plugs into the same prompt by virtue of being in `CHAIN_REGISTRY`. Tracked separately.

## Non-custodial invariants (must hold)

1. The session-key privkey never leaves `sessionEoa.ts` scope. It's only ever passed to `viem` signing/RPC helpers locally.
2. The CLOB credentials (`apiKey`, `secret`, `passphrase`) live only in CloudStorage and in-memory derivations inside `submitPolymarketOrder`. They never travel to BE. **Not** in logs, **not** in toasts, **not** in error bodies posted to BE.
3. Every EIP-712 signature is produced FE-side and either (a) submitted to a third-party endpoint (Polymarket CLOB) FE-side, or (b) returned to BE solely as proof-of-completion. BE recovers the signer locally and discards.
4. `interpretSignError` and the auto-sign fallback screen do not include raw signatures or CLOB creds in `errorRaw`. Add explicit filter.

## Design

### 1. `SignRequest` typed union

```ts
// fe/privy-auth/src/types/signRequest.ts (or wherever the type lives)

type SignRequestKind = 'userop' | 'eoa_tx' | 'eip712';

interface BaseSignRequest {
  requestId: string;
  chainId: number;
  autoSign: boolean;
}

interface UseropSignRequest extends BaseSignRequest {
  kind: 'userop';
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
}

interface EoaTxSignRequest extends BaseSignRequest {
  kind: 'eoa_tx';
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
}

interface Eip712SignRequest extends BaseSignRequest {
  kind: 'eip712';
  purpose: 'clob_auth' | 'polymarket_order';
  domain: { name: string; version: string; chainId: number; verifyingContract?: `0x${string}` };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, string | number | boolean>;  // BigInts serialized as decimal strings
  betId?: string;       // present for purpose='polymarket_order' open
  positionId?: string;  // present for purpose='polymarket_order' sell
  expiresAt: string;    // ISO; FE refuses to sign past this
}

export type SignRequest = UseropSignRequest | EoaTxSignRequest | Eip712SignRequest;
```

`fetchNextRequest` already returns the BE row as-is; widen its return type to `SignRequest`. Existing call-sites continue to compile because they only read `requestId` / `autoSign` / `chainId`. The places that read `to` / `value` / `data` get narrowed by a `kind === 'userop' || kind === 'eoa_tx'` guard.

### 2. `SignHandler` dispatcher

The current effect at `SignHandler.tsx:144-375` is the auto-sign engine. Refactor the inner `(async () => …)()` body so the only branch on `kind` is the signing primitive:

```ts
const result = await dispatchSign(currentRequest, eoa, getSessionClient);
// result: { kind: 'userop'|'eoa_tx'; hash: Hex } | { kind: 'eip712'; signature: Hex; signer: Address; polymarketOrderId?: string }

await postResponse(backendUrl, buildResponseBody(currentRequest, result));
// hash for userop/eoa_tx, signature+signer (+orderId) for eip712.

await reportTxHashIfApplicable(result);  // userop/eoa_tx only

const next = await fetchNextRequest(...);
if (next) chainTo(next); else close();
```

`dispatchSign`:

```ts
async function dispatchSign(
  req: SignRequest, eoa: SessionEoa, getSessionClient: (cid: number) => Promise<SessionClient>
) {
  if (req.kind === 'userop') {
    const sc = await getSessionClient(req.chainId);
    const hash = await trackInFlightBroadcast(req.requestId, () =>
      sc.sendTransaction({ to: req.to, value: BigInt(req.value), data: req.data,
                           account: sc.account!, chain: null }));
    return { kind: 'userop', hash } as const;
  }
  if (req.kind === 'eoa_tx') {
    const hash = await sendEoaTx(eoa.privateKey, req.to, req.data, BigInt(req.value), req.chainId);
    return { kind: 'eoa_tx', hash } as const;
  }
  // eip712
  if (new Date(req.expiresAt) < new Date()) throw new SignRequestExpired(req.requestId);
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
    return { kind: 'eip712', signature, signer: account.address, polymarketOrderId } as const;
  }
  // purpose === 'clob_auth': FE calls /auth/api-key, stores creds, no order to submit
  const auth = { signer: account.address, timestamp: String(req.message.timestamp),
                 nonce: String(req.message.nonce), signature };
  const creds = await deriveClobApiKey(getPolymarketClobApi(), auth);
  await saveClobCreds(req.chainId, creds);
  return { kind: 'eip712', signature, signer: account.address } as const;
}
```

Failure semantics match the existing UserOp path: try once, on throw run `interpretSignError`, set `autoSignError`, post the typed error body to BE so the BE-side error-catalog can react (e.g. drift, BET_IN_FLIGHT). Manual-confirm fallback is unchanged.

### 3. CLOB credentials in CloudStorage

```ts
// fe/privy-auth/src/utils/clobCreds.ts

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
  // Iterate known chain ids from CHAIN_REGISTRY. Polymarket = 137 only today,
  // but keeping this list-based future-proofs for multi-prediction-market.
  for (const cid of Object.keys(CHAIN_REGISTRY).map(Number)) {
    await cloudStorageRemoveItem(KEY(cid));
  }
}
```

`useDelegatedKey.removeKey` calls `wipeClobCreds()` alongside `cloudStorageRemoveItem('delegated_key')`. Order: onchain revoke → BE revoke → wipe delegated_key → wipe CLOB creds. All best-effort, all logged.

Encryption helper reuse: the same AES-GCM + PBKDF2 routine the session-key blob uses. Factor it into `utils/encryptedCloudStorage.ts` if it isn't already.

### 4. `submitPolymarketOrder`

```ts
// fe/privy-auth/src/utils/polymarket.ts  (additions)

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
```

`hmacSign` is `HMAC-SHA256` with `creds.secret` base64-decoded as the key, output base64url. Polymarket's CLOB authentication format. Implementation in `utils/hmac.ts`.

The function is fire-and-forget from `SignHandler`'s point of view: it either returns an order id (success → put in response body) or throws (error → existing error path).

### 5. `sendEoaTx` parameterisation

Today's `sendEoaTx(privateKey, to, data)` is Polygon-hardcoded. Generalise:

```ts
export async function sendEoaTx(
  privateKey: Hex, to: Address, data: Hex, value: bigint = 0n, chainId: number,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  const chain = getChainById(chainId);
  const client = createWalletClient({ account, chain, transport: http(getRpcUrlById(chainId)) });
  return client.sendTransaction({ to, data, value });
}
```

Same shape as today, plus `value` and `chainId`. The only caller after this rewrite is `SignHandler`'s `eoa_tx` branch.

### 6. EIP-712 message BigInt revival

BE serializes BigInts as decimal strings inside `message`. The FE has to revive them to `bigint` per-field-type before passing to `account.signTypedData`:

```ts
function bigintRevive(
  message: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>,
  primary: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of types[primary]) {
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

Snapshot test against the Polymarket `Order` type to confirm the wire-format round-trips.

### 7. `App.tsx` cleanup

Today (paraphrased):

```tsx
if (mode === 'sign')           return <SignHandler …/>
if (mode === 'place_bet')      return <PlaceBetHandler …/>     // DELETE
if (mode === 'close_position') return <ClosePositionHandler …/> // DELETE
if (mode === 'auth')           return <AuthHandler …/>
…
```

After:

```tsx
if (mode === 'sign')           return <SignHandler …/>
if (mode === 'auth')           return <AuthHandler …/>
…
```

The chat deep-link for bet/close now uses the same `sign` mode. The BE-driven queue is what makes the difference — no FE branch needed.

`parseDeepLink` loses `close_position` if nothing else consumes it. Verify with `grep -r "DeepLinkAction\|close_position" fe/privy-auth/src`. If unused, drop the type entirely.

### 8. Files deleted

- `fe/privy-auth/src/components/handlers/PlaceBetHandler.tsx`
- `fe/privy-auth/src/components/handlers/ClosePositionHandler.tsx`
- `fe/privy-auth/src/components/handlers/predictionMarketConstants.ts` (constants either move BE-side as env-driven values BE sends, or get inlined into the BE plan's `enqueueOrderSign` slippage/timeout values)
- Most of `fe/privy-auth/src/utils/predictionMarketApi.ts` — keep only `state`/`positions`/`bet`/`intent` if chat-side or debug-tab still wants them; rename to `pmReadApi.ts`. The mutation methods (`setupStep`, `transitionBet`, `placeOrder`, `sellOrder`, `finalizeBet`, `finalizePosition`, `recordRefund`, `driftDetected`, `bridgeStatus`, `orderbook`) all go.
- `IllegalTransitionError`, `BetInFlightError`: BE no longer surfaces these to FE in the new shape. The drift case becomes a chat message instead of a 4xx/5xx. Drop the classes.
- `polymarket.ts`: `signOrder`, `signClobAuth`, `buildUnsignedOrder`, `clientOrderIdFromSalt` all gone (BE owns the order shape). Keep the domain/types constants only.

### 9. Files added

- `fe/privy-auth/src/utils/clobCreds.ts` (§3)
- `fe/privy-auth/src/utils/hmac.ts` (§4 — HMAC-SHA256 / base64url, via `crypto.subtle`)
- A `dispatchSign` extracted from `SignHandler` into a sibling module for testability.

### 10. Logging

Per the FE logging rules in CLAUDE.md, `SignHandler` already follows the convention. Additions:

```ts
log.info('step', { step: 'started', requestId, kind: req.kind, purpose: req.purpose });
log.debug('eip712 signed', { requestId, signer: account.address });    // never the signature
log.info('step', { step: 'submitted', requestId,
                   polymarketOrderId: result.polymarketOrderId });      // for eip712 order
log.warn('clob-creds-missing', { requestId, chainId });
log.warn('sign-request-expired', { requestId, expiresAt: req.expiresAt });
```

Privacy: `errorRaw` body must scrub `secret`, `passphrase`, `apiKey`, and `signature` before being POSTed to `/response`. Add a `redactCredFields(err)` helper called from the existing `buildErrorRaw`.

### 11. Manual-confirm fallback

`SignHandler`'s manual-confirm path today builds a `SigningRequestModal` showing `to / value / data` for the user to inspect, then signs via a sudo client. The same modal works for `eoa_tx` (same fields). For `eip712`, render a different summary: "Sign typed data: domain={name}, primaryType={primaryType}". Power-user view shows the JSON. Pressing Allow runs `account.signTypedData` and the same FE-side post-processing. Skip Polymarket submission in manual mode? **No** — it's the only useful action. Run it; surface failures normally.

This path should not be reachable for bet flows in production (they always `autoSign: true`), but the code must not crash if it ever is — defensive only.

## Tasks (shippable slices)

Mirroring the BE slices. The FE-side slice cuts:

Slice 0 — type widening + dispatcher refactor (no behaviour change while BE still sends only `userop`):

1. Widen `SignRequest` type, add `kind` to fetch/parse, default `'userop'` when absent.
2. Extract `dispatchSign` from the existing effect body. Only `userop` branch implemented. All existing tests pass.
3. Unit test: `dispatchSign` with synthetic `userop` request returns expected shape.

Slice 1 — `eoa_tx` and `eip712 purpose=clob_auth`:

4. `sendEoaTx` parameterisation (chainId, value).
5. `dispatchSign` `eoa_tx` branch + `eip712 clob_auth` branch (clob creds saved locally).
6. `clobCreds.ts` + `hmac.ts` + encryption helper extraction.
7. Update `useDelegatedKey.removeKey` to wipe clob creds.

Slice 2 — `eip712 purpose=polymarket_order` + CLOB submission:

8. `submitPolymarketOrder` in `polymarket.ts`.
9. `dispatchSign` order branch (load creds, submit, attach orderId).
10. `bigintRevive` + snapshot test against the Polymarket Order type.

Slice 3 — handler/route deletion:

11. Delete `PlaceBetHandler.tsx`, `ClosePositionHandler.tsx`.
12. Trim `predictionMarketApi.ts` → `pmReadApi.ts`.
13. Trim `polymarket.ts` to constants + new submitters.
14. Drop `place_bet` / `close_position` branches from `App.tsx` + `parseDeepLink`.
15. `fe/privy-auth/status.md` entry.

Slice 4 — manual-confirm support for new kinds (defensive):

16. Extend `SigningRequestModal` to render `eip712` summary.
17. Extend manual path in `SignHandler` to handle non-userop kinds.

Each slice is independently revertable. Slice 0 is a pure refactor. Slices 1–2 are gated by the BE actually sending the new kinds — they can ship dark. Slice 3 is the user-visible cutover (do this immediately after BE's slice F flips the flag). Slice 4 can ship any time after slice 2.

## Risks + mitigations

- **`sendEoaTx` requires the EOA to hold MATIC.** Mitigation: setup chain enqueues a `userop` that funds the EOA before any `eoa_tx` is issued (see BE plan §4). FE's `eoa_tx` branch surfaces "out of gas" via existing `interpretSignError` — already maps to a friendly message.
- **CLOB submission failure between FE-sign and BE `/response`.** Mitigation: `submitPolymarketOrder` is part of `dispatchSign`'s `eip712 polymarket_order` path. If CLOB rejects, we throw, the existing error path posts a typed error to BE, the BE marks the bet `FAILED` with `failureReason: 'clob_rejected'`, and the sweep job refunds. No order is lost because nothing was submitted; no order is duplicated because the FE didn't post `/response { polymarketOrderId }`.
- **Mini-app closed after CLOB submit but before `/response { polymarketOrderId }`.** Mitigation: BE's fill poller looks at the bet's recorded `polymarketOrderId` to detect fills. If the FE never posts the id, BE has no way to find the order. Belt-and-suspenders: in `dispatchSign`, post `/response` BEFORE returning — if `/response` fails, retry once with backoff before throwing. (Same pattern as the existing `reportTxHash`.) Worst case: order is live, BE doesn't know about it, fill-timeout kicks in, BE marks the bet `UNFILLED`, sweep runs — but the order may actually have filled. The poller has to also probe Polymarket for "any orders by this proxy with our signature/salt" as a recovery — out of scope for this plan; flag in `fe/STATUS.md` as a known-unresolved edge.
- **Signature scope confusion.** Mitigation: `expiresAt` < 60s for order signs; FE refuses to sign past it. BE refuses `/response` past it. Window is short enough that a stale sign-request can't be replayed by a later mini-app open.
- **CloudStorage encryption keyed on `privyDid`.** Mitigation: BLOCKER-2 covers this for the session-key blob; CLOB creds inherit whatever fix lands. This plan documents the inheritance but does not fix it.
- **HMAC signing in a WebView.** Mitigation: `crypto.subtle.sign('HMAC', …)` is available in Telegram Desktop / iOS / Android WebViews. Smoke-test on the three platforms during slice 2.

## Acceptance

- Confirm a bet → mini-app opens → no taps → closes within 30s on first bet, 10s on subsequent. Verified on iOS, Android, Telegram Desktop.
- `/bet $5 yes` followed by force-quit of TG → reopen mini-app 5 minutes later → bet completes without duplication.
- Disconnect bot → CloudStorage no longer contains `delegated_key` or `polymarket_clob_creds_137`. Verified via debug tab.
- `grep -rn "privateKey\|secret\|passphrase\|apiKey\|signature" fe/privy-auth/src/utils/predictionMarketApi.ts fe/privy-auth/src/components/handlers/` (after refactor) returns no production-code references in handlers. Only `polymarket.ts`, `clobCreds.ts`, `hmac.ts`, `submitPolymarketOrder` legitimately reference them.
- `errorRaw` posted to BE on a failed bet sign contains no signature material (assert via integration test that mocks `/response`).
- DebugTab shows no Sonner toast during the bet flow (auto-sign success path is silent, matching `/send`).
- Drift > BE-configured threshold: BE chat posts the friendly message, mini-app sees no queued request, closes immediately.

## Status.md updates after merge

- `fe/privy-auth/status.md`: top-of-file entry "Prediction markets — zero-sign rewrite — 2026-05-…". List deleted handlers/types, new SignHandler kinds, new utils (`clobCreds`, `hmac`), new convention "auto-sign queue is the only mini-app surface for prediction-market flows".
- New convention to record: "CloudStorage keys are listed in one place (`utils/cloudStorageKeys.ts` if it doesn't already exist) and `useDelegatedKey.removeKey` wipes every entry on disconnect." So adding a future per-protocol creds blob doesn't silently survive disconnect.
