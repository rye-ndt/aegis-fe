# HTTP-Only Communication Revamp — Frontend Plan

## Goal

Remove SSE entirely. Every mini app open is driven by a `?requestId` in the URL. The app fetches the request, runs Privy auth (in parallel), then dispatches to a typed handler that does the work and POSTs back the result.

---

## Shared Types

**New file:** `src/types/miniAppRequest.types.ts`

Exact verbatim copy of `miniAppRequest.types.ts` from BE. No shared package, no cross-repo import.

```typescript
export type RequestType = 'auth' | 'sign' | 'approve';
export type ApproveSubtype = 'session_key' | 'aegis_guard';

interface BaseRequest {
  requestId: string;
  requestType: RequestType;
  createdAt: number;
  expiresAt: number;
}

export interface AuthRequest extends BaseRequest {
  requestType: 'auth';
  telegramChatId: string;
}

export interface SignRequest extends BaseRequest {
  requestType: 'sign';
  userId: string;
  to: string;
  value: string;          // wei as decimal string
  data: string;           // 0x calldata
  description: string;
  autoSign: boolean;
}

export interface ApproveRequest extends BaseRequest {
  requestType: 'approve';
  userId: string;
  subtype: ApproveSubtype;
  suggestedTokens?: Array<{ address: string; symbol: string; decimals: number }>;
}

export type MiniAppRequest = AuthRequest | SignRequest | ApproveRequest;

interface BaseResponse {
  requestId: string;
  requestType: RequestType;
  privyToken: string;
}

export interface AuthResponse extends BaseResponse {
  requestType: 'auth';
  telegramChatId: string;
}

export interface SignResponse extends BaseResponse {
  requestType: 'sign';
  txHash?: string;
  rejected?: boolean;
}

export interface DelegationRecord {
  publicKey: string;
  address: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  signerAddress: `0x${string}`;
  permissions: unknown[];
  grantedAt: number;
}

export interface AegisGrant {
  sessionKeyAddress: string;
  smartAccountAddress: string;
  tokens: Array<{ address: string; limit: string; validUntil: number }>;
}

export interface ApproveResponse extends BaseResponse {
  requestType: 'approve';
  subtype: ApproveSubtype;
  delegationRecord?: DelegationRecord;
  aegisGrant?: AegisGrant;
  rejected?: boolean;
}

export type MiniAppResponse = AuthResponse | SignResponse | ApproveResponse;
```

---

## New: useRequest Hook

**New file:** `src/hooks/useRequest.ts`

Reads `?requestId` from the URL and fetches from `GET /request/:requestId`.

```typescript
export function useRequest(backendUrl: string): {
  requestId: string | null;
  request: MiniAppRequest | null;
  loading: boolean;
  error: string | null;
}
```

Implementation:
1. `requestId = new URLSearchParams(window.location.search).get('requestId')`
2. If no `requestId`: return `{ requestId: null, request: null, loading: false, error: null }`
3. On mount: `GET ${backendUrl}/request/${requestId}`
   - 404 → `error: 'Request not found or expired'`
   - 410 → `error: 'Request expired'`
   - network failure → `error: 'Could not reach server'`
   - 200 → set `request`
4. No auth headers on this call — UUID is the access credential

---

## New: postResponse Utility

**New file:** `src/utils/postResponse.ts`

```typescript
export async function postResponse(
  backendUrl: string,
  response: MiniAppResponse,
): Promise<void>
```

- `POST ${backendUrl}/response`
- Headers: `{ 'Content-Type': 'application/json', Authorization: 'Bearer ${response.privyToken}' }`
- Body: `JSON.stringify(response)`
- Throws on non-2xx with the response status as the error message

---

## Handler Components

Three components, each receives the fully-fetched `request` + `privyToken`. Each handles its own logic end-to-end and calls `postResponse` when done. All are rendered inside an authenticated gate in `App.tsx`.

### AuthHandler — `src/components/handlers/AuthHandler.tsx`

Props: `{ request: AuthRequest; privyToken: string; backendUrl: string }`

Logic:
1. `telegramChatId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() ?? request.telegramChatId`
2. `postResponse(backendUrl, { requestId, requestType: 'auth', privyToken, telegramChatId })`
3. Show brief "Signed in" confirmation UI
4. `window.Telegram?.WebApp?.close()` after short delay (or keep open if no close is available)

No wallet access needed. Fires once on mount.

### SignHandler — `src/components/handlers/SignHandler.tsx`

Props:
```typescript
{
  request: SignRequest;
  privyToken: string;
  backendUrl: string;
  serializedBlob: string | null;   // from useDelegatedKey at App.tsx level
}
```

Logic — mirrors the existing `useSigningRequests` auto-sign + manual paths:

**Auto-sign path** (`request.autoSign === true`):
1. If `serializedBlob` present:
   - `createSessionKeyClient(serializedBlob, ZERODEV_RPC, PAYMASTER_URL)`
   - `sessionClient.sendTransaction({ to, value: BigInt(value), data })`
   - `postResponse(backendUrl, { requestId, requestType: 'sign', privyToken, txHash: hash })`
   - `window.Telegram.WebApp.close()`
2. If `serializedBlob` is null: wait up to 10 s via a `useEffect` that watches the prop; on timeout, fall back to manual path with a warning

**Manual-sign path** (`request.autoSign === false` or blob timeout):
1. Render `SigningRequestModal` (existing component) with request details
2. On approve callback: sign + `postResponse(backendUrl, { ..., txHash })` + close
3. On reject callback: `postResponse(backendUrl, { ..., rejected: true })` + close

### ApproveHandler — `src/components/handlers/ApproveHandler.tsx`

Props:
```typescript
{
  request: ApproveRequest;
  privyToken: string;
  backendUrl: string;
  // Forwarded from useDelegatedKey at App.tsx level:
  delegatedKeyState: DelegatedKeyState;
  startDelegatedKey: () => void;
  updateBlob: (blob: string) => void;
  keypairRef: React.RefObject<Keypair | null>;
  keypairAddress: string | null;
  // Wallet access for on-chain install:
  embeddedWallet: ConnectedWallet | undefined;
  smartAccountAddress: string;
  signerAddress: string;
  privyDid: string;
}
```

**For `subtype === 'session_key'`:**
1. Render `ApprovalOnboarding` (existing component) which drives the `useDelegatedKey` install flow
2. When `delegatedKeyState.status === 'unlocked'`, extract the `delegationRecord` from the hook state
3. `postResponse(backendUrl, { requestId, requestType: 'approve', privyToken, subtype: 'session_key', delegationRecord })`
4. Close mini app

On reject / user dismisses:
- `postResponse(backendUrl, { ..., rejected: true })` + close

**For `subtype === 'aegis_guard'`:**
1. Render `AegisGuardModal` (existing component; currently lives inside `App.tsx` area)
2. On confirm: `installSessionKeyWithErc20Limits(...)` → builds `aegisGrant`
3. `postResponse(backendUrl, { requestId, requestType: 'approve', privyToken, subtype: 'aegis_guard', aegisGrant })`
4. Close mini app

On reject:
- `postResponse(backendUrl, { ..., rejected: true })` + close

---

## App.tsx Refactor

### What changes

**Remove:**
- `usePrivySession` hook (the `POST /auth/privy` effect inside it is gone; only the `privyToken` getter is needed)
- `useSigningRequests` import and call
- `ConnectedView`'s `isReapproval` / `isSigningDeepLink` / `isAutoSignDeepLink` URL param routing
- `ConnectedView`'s delegation-fetch effect (no longer needed to decide what to render)
- `backendJwt` state — it was always `=== privyToken`; replace every reference with `privyToken` directly
- The auto-load effect for `delegatedKeyHook.start()` on `isAutoSignDeepLink`

**Simplify `usePrivySession` → inline or rename to `usePrivyToken`:**

```typescript
// No more POST /auth/privy call. Just get the token.
function usePrivyToken(): string | null {
  const { authenticated, getAccessToken } = usePrivy();
  const [privyToken, setPrivyToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!authenticated) { setPrivyToken(null); return; }
    getAccessToken().then(setPrivyToken);
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps
  return privyToken;
}
```

**New `App.tsx` render flow:**

```typescript
export default function App() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { client } = useSmartWallets();
  const privyToken = usePrivyToken();
  const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';

  const { requestId, request, loading: requestLoading, error: requestError } = useRequest(backendUrl);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const eoaAddress = (embeddedWallet ?? wallets[0])?.address ?? '';
  const smartAddress = client?.account?.address ?? '';

  // useDelegatedKey is always called so serializedBlob is available for SignHandler
  const delegatedKey = useDelegatedKey({
    smartAccountAddress: smartAddress,
    signerAddress: eoaAddress,
    signerWallet: embeddedWallet,
    privyDid: user?.id ?? '',
    backendJwt: privyToken,  // rename this prop to privyToken in useDelegatedKey
  });

  // ── Privy not ready ─────────────────────────────────────────────────────
  if (!ready) return <LoadingSpinner />;

  // ── Auth gate — applies to both status page and handlers ─────────────────
  if (!authenticated || !privyToken) {
    if (isInsideTelegram() && !tmaLoginTimedOut) return <LoadingSpinner />;
    return <LoginView />;
  }

  // ── No requestId — auth-gated status page ────────────────────────────────
  if (!requestId) {
    return (
      <StatusView
        eoaAddress={eoaAddress}
        smartAddress={smartAddress}
        privyToken={privyToken}
        getAccessToken={getAccessToken}
        removeKey={import.meta.env.DEV ? delegatedKey.removeKey : undefined}
      />
    );
  }

  // ── Request fetch in progress or failed ──────────────────────────────────
  if (requestLoading) return <LoadingSpinner />;
  if (requestError) return <ErrorView message={requestError} />;

  // ── Dispatch to typed handler ────────────────────────────────────────────
  if (request!.requestType === 'auth') {
    return <AuthHandler request={request as AuthRequest} privyToken={privyToken} backendUrl={backendUrl} />;
  }
  if (request!.requestType === 'sign') {
    return (
      <SignHandler
        request={request as SignRequest}
        privyToken={privyToken}
        backendUrl={backendUrl}
        serializedBlob={delegatedKey.serializedBlob}
      />
    );
  }
  if (request!.requestType === 'approve') {
    return (
      <ApproveHandler
        request={request as ApproveRequest}
        privyToken={privyToken}
        backendUrl={backendUrl}
        delegatedKeyState={delegatedKey.state}
        startDelegatedKey={delegatedKey.start}
        updateBlob={delegatedKey.updateBlob}
        keypairRef={delegatedKey.keypairRef}
        keypairAddress={delegatedKey.keypairAddress}
        embeddedWallet={embeddedWallet}
        smartAccountAddress={smartAddress}
        signerAddress={eoaAddress}
        privyDid={user?.id ?? ''}
      />
    );
  }

  return <ErrorView message="Unknown request type" />;
}
```

`TelegramAutoLogin` is rendered unconditionally from `main.tsx` or just above the dispatch so `loginWithTelegram` fires immediately on mount regardless of requestType.

### StatusView (replaces ConnectedView)

Shown when the mini app is opened without a `?requestId` — e.g., from the Telegram mini app menu, a bookmark, or direct navigation. Auth-gated (unreachable before the auth check above passes).

Props: `{ eoaAddress, smartAddress, privyToken, getAccessToken, removeKey? }`

Renders exactly the final return block of the current `ConnectedView`:
- Shield icon + "Connected" label
- `AddressRow` for Smart Wallet (`smartAddress`)
- `AddressRow` for Signer / EOA (`eoaAddress`)
- `TokenRow` with copy button — calls `getAccessToken()` at copy-time for a fresh token (preserves the `/auth <token>` fallback)
- "Return to Telegram to use the bot." footer text
- `[dev] Remove session key` button (only when `removeKey` prop is present)

`ConnectedView` is deleted. Its routing logic (delegation fetch, `isReapproval`, `isSigningDeepLink`) is gone; its wallet-display block becomes `StatusView`.

### New: ErrorView

Props: `{ message: string }`. Displays the error message with a "Close" button that calls `window.Telegram?.WebApp?.close()`.

---

## Changes to useDelegatedKey.ts

### Remove POST /persistent calls

Two call sites post to `/persistent` today:
- **Create path** (~line 186): after installing the session key on-chain
- **Unlock path** (~line 123): each time the key is decrypted from CloudStorage on mount

Both are removed. The delegation record is now only sent to the BE as part of the `ApproveResponse` body via `postResponse`. `useDelegatedKey` becomes a pure local state machine — it manages keypair generation, on-chain install, and CloudStorage encryption/decryption only.

---

## Keep Unchanged

| File | Reason |
|---|---|
| `src/components/TelegramAutoLogin.tsx` | Still fires `loginWithTelegram` on mount; unchanged |
| `src/components/ApprovalOnboarding.tsx` | Used by `ApproveHandler` for session_key subtype |
| `src/components/SigningRequestModal.tsx` | Used by `SignHandler` for manual-sign path |
| `src/components/SigningApprovalModal.tsx` | Used by `SignHandler` if applicable |
| `src/utils/crypto.ts` | All crypto operations unchanged |
| `src/utils/telegramStorage.ts` | CloudStorage wrapper unchanged |
| `src/utils/decodeEip712.ts` | Unchanged |

---

## Remove

| File | Reason |
|---|---|
| `src/hooks/useSigningRequests.ts` | Entire file replaced by `SignHandler` + `useRequest` |
| `src/hooks/usePendingSigning.ts` | Replaced by `SignHandler` |

---

## File Summary

### New

| File | Purpose |
|---|---|
| `src/types/miniAppRequest.types.ts` | Shared request/response type definitions (BE mirror) |
| `src/hooks/useRequest.ts` | Fetch typed request from BE on mount |
| `src/utils/postResponse.ts` | POST typed response to BE |
| `src/components/handlers/AuthHandler.tsx` | Handles auth request type end-to-end |
| `src/components/handlers/SignHandler.tsx` | Handles sign request type (auto + manual) end-to-end |
| `src/components/handlers/ApproveHandler.tsx` | Handles approve request type (session_key + aegis_guard) end-to-end |
| `src/components/StatusView.tsx` | Wallet status page (SCA + EOA addresses, Privy token copy); shown when no requestId |

### Modified

| File | Changes |
|---|---|
| `src/App.tsx` | Remove `usePrivySession` POST call, `useSigningRequests`, URL routing; hoist auth gate; add `useRequest` dispatch; add `StatusView` for no-requestId branch |
| `src/hooks/useDelegatedKey.ts` | Remove both `POST /persistent` call sites |

### Deleted

| File |
|---|
| `src/hooks/useSigningRequests.ts` |
| `src/hooks/usePendingSigning.ts` |
