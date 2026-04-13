# SSE Signing Requests — Frontend

## Goal

After the session key is unlocked, the frontend opens a persistent SSE connection to the backend. When the Telegram bot (or any API caller) pushes a signing request, the frontend receives it, shows a human-readable approval modal, builds and submits the UserOp using the decrypted session key, then POSTs the txHash back to the backend.

---

## Architecture

```
Backend                              Browser
  │                                     │
  │  GET /events  (JWT auth, SSE)        │
  │◄────────────────────────────────────│ (connect after unlock)
  │                                     │
  │  data: {"type":"sign_request",...}  │
  │────────────────────────────────────►│
  │                                     │ (show SigningRequestModal)
  │                                     │ (user approves)
  │                                     │ (buildAndSubmitUserOp)
  │                                     │
  │  POST /sign-response                │
  │◄────────────────────────────────────│ { requestId, txHash }
  │                                     │
```

---

## SSE Event Shape

```ts
// Received from backend via EventSource
type SignRequestEvent = {
  type: 'sign_request';
  requestId: string;        // UUID — echoed back in POST /sign-response
  to: string;               // target contract address
  value: string;            // native token amount in wei, as decimal string
  data: string;             // calldata hex
  description: string;      // human-readable summary written by the bot
  expiresAt: number;        // unix timestamp; frontend should reject if expired
};
```

---

## File Map

| File | Role |
|---|---|
| `src/hooks/useSigningRequests.ts` | Opens EventSource after unlock; handles sign_request events; submits UserOp; POSTs result |
| `src/components/SigningRequestModal.tsx` | Approval UI for bot-pushed signing requests |
| `src/utils/crypto.ts` | **Already has** `createSessionKeyClient` — used to reconstruct session key |
| `src/App.tsx` | **Modified**: mount `useSigningRequests` when delegationState is `done`; render `SigningRequestModal` |

---

## Step-by-Step Implementation

### Step 1 — `src/hooks/useSigningRequests.ts`

```ts
export type SignRequestEvent = {
  type: 'sign_request';
  requestId: string;
  to: string;
  value: string;
  data: string;
  description: string;
  expiresAt: number;
};

export type PendingSigningRequest = {
  event: SignRequestEvent;
  approve: () => Promise<void>;
  reject: () => void;
};

export function useSigningRequests(options: {
  serializedBlob: string | null;   // decrypted blob from unlock — null if not unlocked
  jwtToken: string | null;         // backend JWT for auth
  zerodevRpc: string;
}): {
  pending: PendingSigningRequest | null;
}
```

Implementation:
- Open `EventSource` with `GET ${VITE_BACKEND_URL}/events` using `?token=<jwt>` in the URL
  (EventSource doesn't support custom headers; pass JWT as query param)
- On `message` event: parse JSON, check `type === 'sign_request'`
- Check `event.expiresAt > Date.now() / 1000`; if expired, auto-reject silently
- Expose `pending` with:
  - `approve()`: calls `createSessionKeyClient(serializedBlob, zerodevRpc)`, builds+submits UserOp, POSTs result
  - `reject()`: clears `pending`, calls `POST /sign-response { requestId, rejected: true }`
- On component unmount: close EventSource

**Building and submitting the UserOp:**

```ts
async function buildAndSubmit(
  client: KernelAccountClient,
  event: SignRequestEvent,
  backendUrl: string,
  jwt: string,
): Promise<string> {
  const txHash = await client.sendUserOperation({
    callData: await client.account.encodeFunctionData({
      // use encodeCallData from @zerodev/sdk
    }),
  });
  // or use client.sendTransaction for direct call:
  const hash = await client.sendTransaction({
    to: event.to as `0x${string}`,
    value: BigInt(event.value),
    data: event.data as `0x${string}`,
  });
  await fetch(`${backendUrl}/sign-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ requestId: event.requestId, txHash: hash }),
  });
  return hash;
}
```

> **Note**: `KernelAccountClient.sendTransaction` wraps the call as a UserOp automatically when the account is a smart account. No manual UserOp construction needed.

---

### Step 2 — `src/components/SigningRequestModal.tsx`

Props:
```ts
{ request: PendingSigningRequest; onClose: () => void }
```

Layout (similar to `SigningApprovalModal` but for bot requests):
- Header: "Transaction request from bot"
- Body:
  - `description` — prominent, large text
  - Field rows: To / Value (formatted as ETH) / Calldata (truncated hex)
  - "View raw data" toggle → full hex
- Footer:
  - **Approve** — calls `await request.approve()`, shows spinner, shows txHash on success
  - **Reject** — calls `request.reject()`
- Approve button enters loading state during submission; shows error if it throws

---

### Step 3 — Wire into `App.tsx`

`useSigningRequests` needs the decrypted `serializedBlob`, which is only available after the user unlocks and `delegationState.status === 'done'`.

The blob is currently stored only in `useDelegatedKey`'s local `encryptedBlobRef` and never exposed. To thread the decrypted blob out:

**Modify `useDelegatedKey`** to expose `serializedBlob: string | null` in its return:
- In the CREATE branch: store `serializedBlob` in a ref, expose it
- In the UNLOCK branch: store `serializedBlob` in a ref, expose it

**In `App.tsx`:**

```tsx
const { state: delegationState, submitPassword, serializedBlob } = useDelegatedKey({ ... });

const { pending: pendingSignRequest } = useSigningRequests({
  serializedBlob: delegationState.status === 'done' ? serializedBlob : null,
  jwtToken,   // need to expose from usePrivySession or fetch from backend
  zerodevRpc: import.meta.env.VITE_ZERODEV_RPC,
});

// In ConnectedView:
{pendingSignRequest && (
  <SigningRequestModal
    request={pendingSignRequest}
    onClose={() => {/* auto-clears */}}
  />
)}
```

**JWT for backend auth:** The frontend currently has `privyToken` (Privy access token). This needs to be exchanged for the backend JWT via `POST /auth/privy`. Add a `useBackendJwt` hook or extend `usePrivySession` to call `POST /auth/privy` after login and store the resulting JWT.

---

## Threading the serializedBlob

Add to `useDelegatedKey` return type:
```ts
serializedBlob: string | null
```

In `submitPassword`:
- After `decryptBlob` succeeds → `serializedBlobRef.current = serializedBlob`
- After `installSessionKey` succeeds → `serializedBlobRef.current = serializedBlob`

Expose: `return { state, submitPassword, serializedBlob: serializedBlobRef.current }`

---

## Decisions

1. **JWT transport**: Pass as `?token=<jwt>` query param on the EventSource URL (EventSource API doesn't support request headers).
2. **UserOp submission**: Frontend submits directly to the ZeroDev bundler via `client.sendTransaction`. Backend receives only the txHash.
3. **Expiry**: Requests older than `expiresAt` are silently dropped by the frontend (no modal shown).
4. **Reconnect**: EventSource reconnects automatically on connection drop (browser built-in). No manual retry needed.
5. **Multiple requests**: Only one `pending` at a time. If a second arrives while first is pending, queue it (FIFO). Simplest approach: queue as `SignRequestEvent[]`, dequeue one at a time.

---

## Out of Scope

- Batching multiple calls into one UserOp
- Simulating the call before approval (gas estimation)
- Push notifications when the mini app is closed
