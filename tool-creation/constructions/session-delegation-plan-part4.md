# Session Delegation — Part 4 of 4
# Steps covered: Step 9 (App.tsx) · Step 10 (env vars) · Dev mock · Security notes · Future work

> Part of: session-delegation-plan.md  
> Date: 2026-04-11  
> Prerequisite: Parts 1–3 completed (all utils, components, and the hook are created)

---

## Step 9 — Modify `src/App.tsx`

### 9a — Add imports

```typescript
import { useDelegatedKey, type DelegationState } from './hooks/useDelegatedKey';
import { PasswordDialog } from './components/PasswordDialog';
import { DelegationDebugPanel } from './components/DelegationDebugPanel';
```

### 9b — Update `ConnectedView` props

```typescript
function ConnectedView({
  eoaAddress,
  smartAddress,
  privyToken,
  delegationState,
  submitPassword,
}: {
  eoaAddress: string;
  smartAddress: string;
  privyToken: string | null;
  delegationState: DelegationState;
  submitPassword: (password: string) => void;
}) {
```

### 9c — Add delegation UI inside `ConnectedView` JSX

After `{privyToken && <TokenRow token={privyToken} />}`, before the disconnect button:

```tsx
{delegationState.status === 'needs_password' && (
  <PasswordDialog
    mode={delegationState.mode}
    onSubmit={submitPassword}
    error={delegationState.error}
  />
)}

{delegationState.status === 'processing' && (
  <p className="text-xs text-white/40 animate-pulse">{delegationState.step}</p>
)}

{delegationState.status === 'error' && (
  <div className="w-full max-w-sm bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3">
    <p className="text-xs text-red-400">{delegationState.message}</p>
  </div>
)}

{delegationState.status === 'done' && (
  <DelegationDebugPanel record={delegationState.record} />
)}
```

### 9d — Wire the hook in `App()`

After `const privyToken = usePrivySession();`:

```typescript
const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
const { state: delegationState, submitPassword } = useDelegatedKey({
  smartAccountAddress: client?.account?.address ?? '',
  signerAddress: embeddedWallet?.address ?? '',
  signerWallet: embeddedWallet,
});
```

### 9e — Pass new props to `ConnectedView`

```tsx
return (
  <ConnectedView
    eoaAddress={eoaAddress}
    smartAddress={smartAddress}
    privyToken={privyToken}
    delegationState={delegationState}
    submitPassword={submitPassword}
  />
);
```

---

## Step 10 — Environment variables

Add to `.env.local`:

```dotenv
VITE_BACKEND_URL=http://localhost:4000
VITE_ZERODEV_RPC=https://rpc.zerodev.app/api/v2/bundler/{your-project-id}
```

Replace `{your-project-id}` with the ID from https://dashboard.zerodev.app. Ensure the project is configured for **Avalanche Fuji** (chain ID 43113).

---

## What NOT to change

- `src/main.tsx` — no changes
- `src/index.css` — no changes
- Existing `AddressRow`, `TokenRow`, `LoadingSpinner`, `LoginView`, `ShieldIcon`, `GoogleIcon`, `usePrivySession` — all untouched

---

## Dev-mode browser testing

Telegram CloudStorage is unavailable in a plain browser. Add a temporary mock at the top of `telegramStorage.ts` (remove before deploying):

```typescript
// TEMPORARY DEV MOCK — remove before deploying
if (!window.Telegram?.WebApp?.CloudStorage) {
  const store = new Map<string, string>();
  (window as any).Telegram = {
    WebApp: {
      ...(window.Telegram?.WebApp ?? {}),
      CloudStorage: {
        setItem: (k: string, v: string, cb?: (e: null, s: boolean) => void) => { store.set(k, v); cb?.(null, true); },
        getItem: (k: string, cb: (e: null, v: string) => void) => cb(null, store.get(k) ?? ''),
        getItems: (ks: string[], cb: (e: null, v: Record<string, string>) => void) => cb(null, Object.fromEntries(ks.map(k => [k, store.get(k) ?? '']))),
        removeItem: (k: string, cb?: (e: null, r: boolean) => void) => { store.delete(k); cb?.(null, true); },
        getKeys: (cb: (e: null, ks: string[]) => void) => cb(null, [...store.keys()]),
      },
    },
  };
}
```

---

## Security properties

| Property | Status |
|---|---|
| Session private key never sent to backend | ✅ Only the public address, public key, and permissions metadata are POSTed |
| Session private key never stored in plaintext | ✅ Always AES-GCM encrypted before CloudStorage write |
| User's Privy private key never touched | ✅ Only the EIP-1193 provider interface is used; private key stays in Privy |
| On-chain permission scope enforced by contract | ✅ Kernel validates every session key UserOp against the installed permission plugin |
| Backend compromise exposes nothing sensitive | ✅ Redis contains only public addresses and permission metadata |

**Remaining risk**: `toSudoPolicy` grants the session key unlimited access within the Kernel account. Replace with `toCallPolicy` scoped to specific token contracts and amounts before production.

---

## How UserOp submission works (future step)

When the bot sends the user a pending action (e.g. "execute swap"), the mini app:

1. Decrypts the serialized blob from CloudStorage (user enters password or it's in memory from this session)
2. Calls `createSessionKeyClient(serializedBlob, zerodevRpc)` → gets a `KernelAccountClient`
3. Calls `client.sendUserOperation(...)` with the calldata prepared by the backend
4. Reports the tx hash to the backend

The backend prepares calldata and awaits the result. It never signs anything.
