# Mini-App Signing Flow — Frontend

## Goal

When the backend pushes a `sign_request` via SSE:

1. The frontend receives it and shows `SigningRequestModal` (already works).
2. After the user approves or rejects, the mini app **closes itself** via `window.Telegram.WebApp.close()`.

That's the only gap on the frontend side. Everything else (`useSigningRequests`, `SigningRequestModal`,
SSE connection, `POST /sign-response`) is already implemented and wired in `App.tsx`.

---

## Gap Analysis (current state)

| # | File | Missing |
|---|------|---------|
| 1 | `src/components/SigningRequestModal.tsx` | Does not call `window.Telegram?.WebApp?.close()` after approve or reject |

No other gaps. The SSE flow is fully wired:
- `useSigningRequests` opens `EventSource`, queues `sign_request` events, exposes `approve` / `reject`
- `approve()` signs via `createSessionKeyClient`, submits the tx, POSTs to `/sign-response`
- `reject()` POSTs to `/sign-response` with `rejected: true`
- `App.tsx` renders `SigningRequestModal` when `pendingBotRequest !== null`
- `serializedBlob` is threaded from `useDelegatedKey` → `useSigningRequests`
- `backendJwt` is threaded from `usePrivySession` → `useSigningRequests`

---

## Step-by-Step Implementation

### Step 1 — `src/components/SigningRequestModal.tsx`

In `handleApprove`, call `window.Telegram?.WebApp?.close()` after the transaction is submitted and
`onClose()` is called. This runs only on success (the catch block leaves the modal open so the user
can see the error and retry).

```diff
  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await request.approve();
      setTxHash('submitted');
      onClose();
+     window.Telegram?.WebApp?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setLoading(false);
    }
  };
```

In `handleReject`, call `window.Telegram?.WebApp?.close()` after rejection is sent:

```diff
  const handleReject = () => {
    if (loading) return;
    request.reject();
    onClose();
+   window.Telegram?.WebApp?.close();
  };
```

`window.Telegram?.WebApp?.close()` is a no-op when running outside a Telegram WebApp context
(browser, dev server), so no guards are needed.

---

## Resulting End-to-End Flow (frontend perspective)

```
Aegis mini app opens (user taps bot button)
  │
  ▼
usePrivy ready + authenticated
  ▼
usePrivySession exchanges Privy token → backendJwt
  ▼
useDelegatedKey checks delegation status
  │
  ├─ needs password → PasswordDialog shown → user submits
  │    └─ session key installed → delegationState.status = 'done'
  │
  └─ already done → delegationState.status = 'done'
  ▼
useSigningRequests mounts EventSource → GET /events
  │
  │  Backend replays any pending sign_request (step 5 in BE plan)
  ▼
EventSource receives sign_request event
  ▼
SigningRequestModal rendered (to, value, calldata, description)
  │
  ├─ Approve tapped
  │    ├─ createSessionKeyClient(blob, zerodevRpc)
  │    ├─ client.sendTransaction(to, value, data)
  │    ├─ POST /sign-response { requestId, txHash }
  │    ├─ modal closes (dequeueRef clears pending state)
  │    └─ window.Telegram.WebApp.close()
  │
  └─ Reject tapped (or Escape key)
       ├─ POST /sign-response { requestId, rejected: true }
       ├─ modal closes
       └─ window.Telegram.WebApp.close()
```

Backend's `onResolved` callback then sends the user a Telegram message:
- On approval: `"Transaction submitted.\nTx hash: 0x..."`
- On rejection: `"Transaction rejected in the app."`

---

## Files Changed

| File | Change |
|---|---|
| `src/components/SigningRequestModal.tsx` | Add `window.Telegram?.WebApp?.close()` in `handleApprove` (success path) and `handleReject` |

---

## Not Needed (already wired)

- `useSigningRequests.ts` — no changes; approve/reject already call `dequeueRef.current()` which clears `pending`
- `App.tsx` — no changes; already renders `SigningRequestModal` when `pendingBotRequest !== null`
- `useDelegatedKey.ts` — no changes; already exposes `serializedBlob`
- `usePrivySession` / `backendJwt` — no changes; already threaded to `useSigningRequests`
