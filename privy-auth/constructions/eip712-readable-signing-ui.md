# EIP-712 Human-Readable Signing UI

## Goal

Intercept `eth_signTypedData_v4` calls that occur during session key delegation (ZeroDev Kernel `Enable`), decode the raw typed data into plain English, and present it to the user before the signature is submitted. A toggle reveals the raw JSON for advanced users.

---

## Architecture Overview

```
useDelegatedKey
  └─ installSessionKey(wrappedProvider, ...)
       └─ serializePermissionAccount(kernelAccount)
            └─ walletClient.signTypedData(...)        ← EIP-712 typed data
                 └─ wrappedProvider.request(eth_signTypedData_v4, ...)
                      └─ SigningInterceptor
                           ├─ decodes typed data → human-readable struct
                           ├─ suspends Promise, emits pending signing event
                           ├─ SigningApprovalModal renders
                           │    ├─ Human-readable view (default)
                           │    └─ Raw JSON toggle
                           └─ on Approve → forward to real Privy provider
                              on Reject  → throw UserRejectedRequestError
```

The real Privy embedded wallet provider never changes. We wrap it in a thin interceptor that pauses outgoing sign requests while the modal is open.

---

## File Map

| File | Role |
|---|---|
| `src/utils/signingInterceptor.ts` | Wraps an EIP1193 provider; intercepts typed data sign calls |
| `src/utils/decodeEip712.ts` | Decodes typed data structs into human-readable form |
| `src/components/SigningApprovalModal.tsx` | UI: readable view + raw toggle + Approve/Reject |
| `src/hooks/usePendingSigning.ts` | React state bridge between interceptor and modal |
| `src/hooks/useDelegatedKey.ts` | **Modified**: wrap provider before passing to installSessionKey |
| `src/App.tsx` | **Modified**: render `<SigningApprovalModal>` in ConnectedView |

---

## Step-by-Step Implementation

### Step 1 — `src/utils/decodeEip712.ts`

Decode known typed data types into a `HumanReadableSigningRequest` struct.

```ts
export type HumanReadableSigningRequest =
  | KernelEnableRequest
  | UnknownEip712Request;

export type KernelEnableRequest = {
  type: 'kernel_enable';
  summary: string;          // one-sentence plain English
  fields: { label: string; value: string }[];
  chainId: number;
  contract: string;
};

export type UnknownEip712Request = {
  type: 'unknown';
  summary: string;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
};
```

**Kernel `Enable` decoder logic:**

- `domain.name === 'Kernel'` → detect as `kernel_enable`
- `validationId`: first byte is plugin type (`0x02` = permission/session key validator)
- `nonce`: how many times this validator has been installed (0 = first time)
- `hook === 0x000...` → "No execution hook"
- `validatorData`: ABI-decode as `(bytes[], bytes[])`:
  - Each entry in array 0 = a signer. Strip 1-byte prefix to get 20-byte address = session key address
  - Array 1 = policies. `toSudoPolicy` produces a specific known encoding; detect and label as "Full access (sudo)"
- `selectorData`: first 4 bytes = function selector
  - `0xe9ae5c53` = `execute(ExecutionMode,bytes)` → "Execute arbitrary calls"
  - Fall back to raw hex for unknown selectors

**Output example:**
```
summary: "Authorize a session key to act on your smart account"
fields:
  - Chain:            Avalanche Fuji (43113)
  - Smart account:    0x11ec04...
  - Session key:      0x67b436...
  - Permissions:      Full access (sudo policy)
  - Allowed actions:  execute(ExecutionMode, bytes)
  - Hook:             None
  - Install nonce:    1 (previously installed once)
```

For `type: 'unknown'`, render domain + all message fields with their key names as labels and values formatted by type (address, uint, bytes → truncated hex).

---

### Step 2 — `src/utils/signingInterceptor.ts`

Wraps any EIP1193 provider. When `eth_signTypedData_v4` is called, pauses execution and calls a callback to surface the request to React state. The outer Promise resolves or rejects based on user action.

```ts
export type PendingSigningRequest = {
  decoded: HumanReadableSigningRequest;
  rawParams: unknown[];         // original params for raw toggle
  approve: () => void;
  reject: () => void;
};

export function createInterceptingProvider(
  inner: EIP1193Provider,
  onPending: (req: PendingSigningRequest) => void,
): EIP1193Provider
```

Implementation:
- Return a proxy object that forwards all `request()` calls to `inner` unchanged, *except* `eth_signTypedData_v4` and `eth_signTypedData`
- For those: parse params[1] (the JSON string), call `decodeEip712`, create a `PendingSigningRequest` where:
  - `approve()` → resolves a deferred Promise, which then calls `inner.request(...)` with original params and resolves the outer Promise with the result
  - `reject()` → rejects with `{ code: 4001, message: 'User rejected the request.' }`
- Call `onPending(pendingRequest)` before returning the outer Promise

---

### Step 3 — `src/hooks/usePendingSigning.ts`

Thin React state hook that the interceptor calls into.

```ts
export function usePendingSigning(): {
  pending: PendingSigningRequest | null;
  onPending: (req: PendingSigningRequest) => void;
}
```

- State: `pending: PendingSigningRequest | null`
- `onPending`: sets `pending` (stable ref, safe to pass to interceptor once)
- After `approve()` or `reject()` resolves, clear `pending` back to null

---

### Step 4 — `src/components/SigningApprovalModal.tsx`

Props:
```ts
{ request: PendingSigningRequest; onClose: () => void }
```

Layout:
- Fixed overlay, centered card
- **Default view** (human-readable):
  - Summary sentence at the top (prominent)
  - Field list: label / value rows
  - "View raw data" toggle link at bottom of field list
- **Raw view** (toggled):
  - Scrollable `<pre>` block with formatted JSON of the original typed data
  - "View readable" toggle link
- Footer: **Approve** button (primary) + **Reject** button (ghost/destructive)
  - Approve → calls `request.approve()`, calls `onClose()`
  - Reject → calls `request.reject()`, calls `onClose()`

Keyboard: `Escape` triggers reject.

---

### Step 5 — Wire into `useDelegatedKey.ts`

In the CREATE branch, before calling `installSessionKey`:

```ts
const provider = await signerWallet.getEthereumProvider();
const wrappedProvider = createInterceptingProvider(provider, onPending);

serializedBlob = await installSessionKey(
  wrappedProvider,   // ← was: provider
  ...
);
```

`onPending` comes from `usePendingSigning` passed in via props or a shared ref.

**How to thread `onPending` in**: add it as a param to `useDelegatedKey`:
```ts
export function useDelegatedKey(options: {
  smartAccountAddress: string;
  signerAddress: string;
  signerWallet: ConnectedWallet | undefined;
  onPendingSigning: (req: PendingSigningRequest) => void;  // ← new
})
```

---

### Step 6 — Wire into `App.tsx`

```tsx
const { pending, onPending } = usePendingSigning();

const { state: delegationState, submitPassword } = useDelegatedKey({
  ...,
  onPendingSigning: onPending,   // ← new
});

// In ConnectedView (or at root level):
{pending && (
  <SigningApprovalModal
    request={pending}
    onClose={() => {/* pending auto-clears after approve/reject */}}
  />
)}
```

---

## Decoder Coverage

| Typed data type | Detection | Coverage |
|---|---|---|
| Kernel `Enable` (session key install) | `domain.name === 'Kernel'` | Full — decode validatorData, selectorData, policies |
| Unknown EIP-712 | fallback | Best-effort — render domain + message fields by key name |

Add new cases to `decodeEip712.ts` as new signing types are encountered. The interceptor and modal are type-agnostic.

---

## Decisions

1. **Reject behavior**: Reject returns the user to `needs_password` state with message "You rejected the signing request — try again." (not a terminal error).

2. **Scope**: Full decoding for Kernel `Enable`; best-effort generic decode for all other `eth_signTypedData_v4` calls (render domain + message fields by key name).

---

## Out of Scope

- Decoding `eth_sign` or `personal_sign` (not used in this flow)
- Simulating the UserOp before displaying (future: show estimated gas)
- Persisting rejected/approved signing history
