# Frontend — Frictionless Delegation Flow

## Context

Revamp the Mini App so delegation is zero-friction: no password dialog, no manual Aegis Guard
toggle. The bot handles everything autonomously using a server-side-enforced spending limit stored
in the new `token_delegations` DB table. Users only open the Mini App to approve limits on first
use or when a limit is exhausted.

This plan is the frontend counterpart to `be/constructions/frictionless-delegation-plan.md`.
Backend items 1–20 must be shipped before the frontend API calls in this plan will work.

---

## Group 8: Remove Password Gate

### 21. `useDelegatedKey.ts` — simplify state machine

**File**: `src/hooks/useDelegatedKey.ts`

**Remove entirely**:
- `needs_password` state variant from `DelegationState`
- `submitPassword` function (and its export)
- `passwordRef` (`React.useRef<string | null>`)
- `NEEDS_CREATE` and `NEEDS_UNLOCK` action types from the `Action` union
- `encryptedBlobRef` only had meaning in the password gate; it can be retained as a local variable
  inside the keypair flow but should not be part of any exported state
- `PasswordDialog` component import and any usage

**New `DelegationState`**:
```typescript
export type DelegationState =
  | { status: 'idle' }
  | { status: 'processing'; step: string }
  | { status: 'done'; record: DelegationRecord }
  | { status: 'error'; message: string };
```

**New `Action` union**:
```typescript
type Action =
  | { type: 'PROCESSING'; step: string }
  | { type: 'DONE'; record: DelegationRecord }
  | { type: 'ERROR'; message: string };
```

**New encryption strategy** — auto-derive key from `privyDid` + fixed salt:

The existing `encryptBlob(data, password)` and `decryptBlob(encrypted, password)` functions in
`crypto.ts` already run PBKDF2 internally with a random salt embedded in the blob. Pass `privyDid`
(the stable Privy user identifier from `usePrivy().user.id`) directly as the `password` argument.
No change to `crypto.ts` function signatures is needed.

```typescript
// Derive the encryption "password" deterministically — no user prompt
const encryptionKey = privyDid; // passed in as a prop/option; never stored in state
```

**New `start()` behaviour** — runs the full keypair flow immediately on call:

```
1. dispatch({ type: 'PROCESSING', step: 'Checking stored session key…' })
2. const existing = await cloudStorageGetItem(STORAGE_KEY)
3. if (existing):
     dispatch({ type: 'PROCESSING', step: 'Decrypting session key…' })
     try:
       const decrypted = await decryptBlob(existing, privyDid)
       parse JSON wrapper { privateKey, address, blob }
       keypairRef.current = { privateKey, address }
       serializedBlobRef.current = blob
       dispatch({ type: 'DONE', record: buildRecord(keypairRef.current, ...) })
       return
     catch DecryptionError:
       // Wrong key (user re-created account?) — fall through to CREATE
4. // CREATE path
   dispatch({ type: 'PROCESSING', step: 'Generating session keypair…' })
   const keypair = generateKeypair()
   keypairRef.current = keypair
   dispatch({ type: 'PROCESSING', step: 'Installing session key on-chain…' })
   const blob = await installSessionKey(rawProvider, signerAddress, keypair.privateKey, keypair.address, zerodevRpc)
   serializedBlobRef.current = blob
   dispatch({ type: 'PROCESSING', step: 'Storing session key…' })
   const payload = JSON.stringify({ privateKey: keypair.privateKey, address: keypair.address, blob })
   const encrypted = await encryptBlob(payload, privyDid)
   await cloudStorageSetItem(STORAGE_KEY, encrypted)
   // POST public record to backend (existing /persistent endpoint)
   dispatch({ type: 'DONE', record: buildRecord(keypair, ...) })
```

**Updated hook signature** — add `privyDid` option, remove `submitPassword` from return:

```typescript
export function useDelegatedKey(options: {
  smartAccountAddress: string;
  signerAddress: string;
  signerWallet: ConnectedWallet | undefined;
  privyDid: string;                          // NEW — used for key derivation
}): {
  state: DelegationState;
  start: () => void;
  removeKey: () => Promise<void>;
  serializedBlob: string | null;
  keypairRef: React.MutableRefObject<{ privateKey: `0x${string}`; address: `0x${string}` } | null>;
  keypairAddress: string | null;
  scaAddress: string;
  updateBlob: (newBlob: string) => Promise<void>;
}
```

`updateBlob` must be updated to use `privyDid` in place of `passwordRef.current`:
```typescript
const updateBlob = React.useCallback(async (newBlob: string) => {
  const payload = JSON.stringify({ privateKey: keypairRef.current?.privateKey, address: keypairRef.current?.address, blob: newBlob });
  const encrypted = await encryptBlob(payload, privyDid);
  await cloudStorageSetItem(STORAGE_KEY, encrypted);
  serializedBlobRef.current = newBlob;
}, [privyDid]);
```

The `started` / `setStarted` guard and the `useEffect` that reads CloudStorage can be removed;
all logic moves directly into `start()` which is now a stable `useCallback` wrapping an async
IIFE.

### 22. `crypto.ts` — remove `installSessionKeyWithErc20Limits`

**File**: `src/utils/crypto.ts`

**Remove**: `installSessionKeyWithErc20Limits` function and its imports
(`toCallPolicy`, `ParamCondition`, `erc20Abi` from ZeroDev, and the `paymaster` import if only
used there).

**Keep unchanged**: `generateKeypair`, `installSessionKey` (sudo policy), `encryptBlob`,
`decryptBlob`, `createSessionKeyClient`, `Permission` type, `DelegationRecord` type.

No callers of `installSessionKeyWithErc20Limits` remain after this plan is implemented (it was
only called from `useAegisGuard.ts`, which is deleted in Group 11). Verify with:
```
grep -r "installSessionKeyWithErc20Limits" src/
```

### 23. Delete `PasswordDialog.tsx`

**File**: `src/components/PasswordDialog.tsx`

Delete the file. Remove its import from `App.tsx` (also removed in Group 10). Verify no other
callers:
```
grep -r "PasswordDialog\|submitPassword" src/
```

---

## Group 9: New Approval Onboarding Component

### 24. `src/components/ApprovalOnboarding.tsx` — the "loop starter"

**New file**: `src/components/ApprovalOnboarding.tsx`

This component handles both initial onboarding (empty delegations) and re-approval (limit
exhausted). It distinguishes the two modes via URL query params.

**Props**:
```typescript
interface ApprovalOnboardingProps {
  backendJwt: string;
  delegatedKey: {
    state: DelegationState;
    start: () => void;
  };
}
```

**On mount**:
1. Read URL params from `window.location.search`:
   - `reapproval=1` → re-approval mode
   - `tokenAddress` and `amountRaw` → specific token re-approval
2. Build query string: `?tokenAddress=<addr>&amountRaw=<raw>` if both params are present.
3. Call `GET /delegation/approval-params` with JWT `Authorization: Bearer <backendJwt>` and the
   optional query string.
4. Store the response `tokens` array in component state as `approvalParams`.

**Display** (while `approvalParams` is loaded):
```
"To let the bot trade on your behalf, approve the following spending limits (one-time, revocable):"

- USDC: 500         (derived from suggestedLimitRaw / 10^tokenDecimals)
- USDT: 500
- AVAX: 50
```
Show a loading spinner while fetching. Show an error state if the fetch fails.

**"Approve" button flow** (single async sequence):
```typescript
// Step 1 — install session key on-chain if not already done
delegatedKey.start();

// Step 2 — wait for installation to complete
// Watch delegatedKey.state via useEffect:
useEffect(() => {
  if (delegatedKey.state.status !== 'done') return;
  // Step 3 — post delegation limits to backend
  (async () => {
    setPosting(true);
    try {
      const delegations = approvalParams.map(p => ({
        tokenAddress: p.tokenAddress,
        tokenSymbol: p.tokenSymbol,
        tokenDecimals: p.tokenDecimals,
        limitRaw: p.suggestedLimitRaw,
        validUntil: p.validUntil,
      }));
      const resp = await fetch(`${backendUrl}/delegation/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${backendJwt}` },
        body: JSON.stringify({ delegations }),
      });
      if (!resp.ok) throw new Error(`Backend returned ${resp.status}`);
      setSuccess(true);
      // Step 4 — close Mini App if inside TMA
      setTimeout(() => window.Telegram?.WebApp?.close(), 1500);
    } catch (err) {
      setPostError(toErrorMessage(err));
    } finally {
      setPosting(false);
    }
  })();
}, [delegatedKey.state.status]);
```

**States to render**:
- `loading` (fetching approval-params): spinner
- `error loading params`: error message + retry button
- `idle / ready`: token list + "Approve" button
- `processing` (delegatedKey.state.status === 'processing'): progress message from
  `delegatedKey.state.step` + spinner; button disabled
- `posting`: "Saving limits…" spinner
- `success`: "All set! The bot is ready to trade on your behalf." + auto-close

**Note on SCA deployment**: `installSessionKey` submits a UserOp that deploys the SCA if this
is the user's first transaction. ZeroDev handles this transparently inside `installSessionKey`.
The component waits for `delegatedKey.state.status === 'done'` before posting, which means the
UserOp receipt has been confirmed — SCA is deployed by then.

### 25. `src/utils/telegramStorage.ts` — no changes needed

Verify that `cloudStorageGetItem` / `cloudStorageSetItem` / `cloudStorageRemoveItem` still work
without the password wrapper. No modifications required; this item is a pre-flight check only.

Run manually in a TMA context to confirm CloudStorage read/write still succeeds after removing
the encrypted blob format's password dependency (the blob format itself is unchanged — it still
carries the embedded PBKDF2 salt and IV; only the seed material changes from user password to
`privyDid`).

---

## Group 10: App.tsx Flow Changes

### 26. `App.tsx` — `ConnectedView` routing logic

**File**: `src/App.tsx`

After `backendJwt` is available (user is authenticated), add the following on-mount check and
routing:

```typescript
// New state
const [delegations, setDelegations] = React.useState<TokenDelegation[] | null>(null);
const [delegationsLoading, setDelegationsLoading] = React.useState(true);

React.useEffect(() => {
  if (!backendJwt) return;
  (async () => {
    try {
      const resp = await fetch(`${backendUrl}/delegation/grant`, {
        headers: { Authorization: `Bearer ${backendJwt}` },
      });
      const data = await resp.json();
      setDelegations(data.delegations ?? []);
    } catch {
      setDelegations([]);  // treat fetch failure as empty → show onboarding
    } finally {
      setDelegationsLoading(false);
    }
  })();
}, [backendJwt]);
```

**Routing in `ConnectedView` render**:
```typescript
const params = new URLSearchParams(window.location.search);
const isReapproval = params.get('reapproval') === '1';
const isSigningDeepLink = params.has('requestId');

if (delegationsLoading) return <LoadingSpinner />;

// Priority order:
if (isSigningDeepLink) {
  return <SigningRequestModal ... />;  // kept for edge-case fallback during transition
}
if (isReapproval || delegations!.length === 0) {
  return <ApprovalOnboarding backendJwt={backendJwt} delegatedKey={delegatedKeyHook} />;
}
// Normal state: delegations exist, no deep-link params — nothing to do, close TMA
// (Mini App was opened for onboarding that is already complete)
window.Telegram?.WebApp?.close();
return null;
```

**Wire `privyDid` into `useDelegatedKey`**:
```typescript
const { user } = usePrivy();
const delegatedKeyHook = useDelegatedKey({
  smartAccountAddress,
  signerAddress,
  signerWallet,
  privyDid: user?.id ?? '',   // NEW — stable Privy user identifier
});
```

### 27. Remove `AegisGuardToggle` and `AegisGuardModal` from `ConnectedView`

In `App.tsx`, remove:
- `import AegisGuardToggle from './components/AegisGuardToggle'`
- `import AegisGuardModal from './components/AegisGuardModal'`
- `import { useAegisGuard } from './hooks/useAegisGuard'`
- The `useAegisGuard(...)` hook call
- The `<AegisGuardToggle ... />` JSX element
- The `<AegisGuardModal ... />` JSX element

---

## Group 11: Cleanup

### 28. Delete `AegisGuardToggle.tsx`, `AegisGuardModal.tsx`, `useAegisGuard.ts`

Delete:
- `src/components/AegisGuardToggle.tsx`
- `src/components/AegisGuardModal.tsx`
- `src/hooks/useAegisGuard.ts`

Verify no remaining imports before deleting:
```
grep -r "AegisGuardToggle\|AegisGuardModal\|useAegisGuard" src/
```

### 29. Confirm `ApprovalOnboarding.tsx` calls `/delegation/grant` (not the old endpoint)

The onboarding component created in item 24 already calls `POST /delegation/grant`. This item
is a cross-check: confirm there are no remaining calls to `POST /aegis-guard/grant` in the FE
codebase:
```
grep -r "aegis-guard" src/
```
Expected result: zero matches.

### 30. `usePendingSigning.ts` — no aegis-guard references

Confirmed during planning: `src/hooks/usePendingSigning.ts` does not call `POST /aegis-guard/grant`.
No changes needed. Re-verify after Group 11 cleanup with the grep above.

---

## Execution Order

```
BE 1–5    schema + repo + migration            (prerequisite for all API calls)
BE 6–9    API endpoints                        (prerequisite for FE API calls)
BE 10     proactive auth prompt                (depends on BE 1–5)
BE 11–14  estimator                            (can overlap with BE 6–10)
BE 15     autonomous execution                 (depends on BE 1–5) ← parallel with FE 21–23
BE 16–17  wire estimator into handler          (depends on BE 11–14 and BE 15)
BE 18–20  cleanup                              (last BE step)

FE 21–23  remove password gate                 (independent of BE, can run in parallel with BE 15)
FE 24–25  ApprovalOnboarding component         (depends on BE 6–9 being live)
FE 26     App.tsx flow changes                 (depends on FE 24)
FE 27–30  cleanup                              (last FE step)
```

**Parallelism note**: BE Group 5 (autonomous execution, item 15) and FE Group 8 (password gate
removal, items 21–23) have no dependencies on each other and can be implemented simultaneously
by separate engineers.

---

## Key Decisions (for implementer context)

| Decision | Choice | Rationale |
|---|---|---|
| Session key scope | Sudo key only; enforce limits server-side | ERC20-scoped key breaks swaps and reward claims. Server-side check is sufficient; matches existing bot backlog item. |
| Blob encryption | Auto-derive key from `privyDid` as PBKDF2 seed | No user prompt; `privyDid` is stable across sessions; existing `encryptBlob`/`decryptBlob` signatures unchanged |
| Intent retry after re-approval | User re-sends message | No "pending intent" state machine needed; simpler architecture |
| Spend tracking | DB column `spentRaw` with single-row Postgres update | Postgres serialises single-row updates; no WATCH/multi needed (unlike Redis) |
| SCA deployment | ZeroDev transparent, no extra handling | `installSessionKey` waits for UserOp receipt; SCA deployed before `done` state fires |
