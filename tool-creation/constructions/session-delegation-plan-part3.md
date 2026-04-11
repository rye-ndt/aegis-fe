# Session Delegation — Part 3 of 4
# Steps covered: Step 6 (PasswordDialog.tsx) · Step 7 (DelegationDebugPanel.tsx) · Step 8 (useDelegatedKey.ts)

> Part of: session-delegation-plan.md  
> Date: 2026-04-11  
> Prerequisite: Parts 1–2 completed (deps installed, `telegram.d.ts`, `toErrorMessage.ts`, `telegramStorage.ts`, `crypto.ts` all created)

---

## Step 6 — Create `src/components/PasswordDialog.tsx`

A full-screen blocking modal. No cancel button — the user must set or enter a password to proceed.

```tsx
import React from 'react';

type Props = {
  mode: 'create' | 'unlock';
  onSubmit: (password: string) => void;
  error?: string;
};

export function PasswordDialog({ mode, onSubmit, error }: Props) {
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');

  const isValid =
    mode === 'create' ? password.length >= 8 && password === confirm : password.length >= 1;

  const handleSubmit = () => { if (isValid) onSubmit(password); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-sm bg-[#0f0f1a] border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-white">
          {mode === 'create' ? 'Set a delegation key password' : 'Unlock your delegation key'}
        </h2>
        <p className="text-xs text-white/40 leading-relaxed">
          {mode === 'create'
            ? 'This password encrypts your signing key stored in Telegram. Minimum 8 characters. Cannot be recovered if lost.'
            : 'Enter the password you set when you first connected.'}
        </p>

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-violet-500/60"
        />

        {mode === 'create' && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-violet-500/60"
          />
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {mode === 'create' && password.length > 0 && password.length < 8 && (
          <p className="text-xs text-white/30">At least 8 characters required</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          {mode === 'create' ? 'Create key' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}
```

---

## Step 7 — Create `src/components/DelegationDebugPanel.tsx`

```tsx
import type { DelegationRecord } from '../utils/crypto';

export function DelegationDebugPanel({ record }: { record: DelegationRecord }) {
  return (
    <div className="w-full max-w-sm flex flex-col gap-3 mt-2">
      <p className="text-[10px] font-semibold tracking-widest text-amber-400 uppercase px-1">
        Debug — Delegation Key (On-Chain Session Key Active)
      </p>

      <DebugRow label="Delegated Address" value={record.address} />
      <DebugRow label="Public Key" value={record.publicKey} />
      <DebugRow label="Smart Account" value={record.smartAccountAddress} />
      <DebugRow label="Signer (EOA)" value={record.signerAddress} />

      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase px-1 mt-1">
        Granted Permissions
      </p>

      {record.permissions.map((p, i) => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-col gap-1">
          <p className="font-mono text-xs text-white/60">Token: {p.tokenAddress}</p>
          <p className="font-mono text-xs text-white/60">Max: {p.maxAmount} wei</p>
          <p className="font-mono text-xs text-white/60">
            Until: {new Date(p.validUntil * 1000).toISOString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-full">
      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1 px-1">
        {label}
      </p>
      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <p className="font-mono text-xs text-white/70 break-all">{value}</p>
      </div>
    </div>
  );
}
```

---

## Step 8 — Create `src/hooks/useDelegatedKey.ts`

### State types

```typescript
export type DelegationState =
  | { status: 'idle' }
  | { status: 'needs_password'; mode: 'create' | 'unlock'; error?: string }
  | { status: 'processing'; step: string }
  | { status: 'done'; record: DelegationRecord }
  | { status: 'error'; message: string };
```

### Full hook

```typescript
import React from 'react';
import type { ConnectedWallet } from '@privy-io/react-auth';
import {
  generateKeypair,
  encryptBlob,
  decryptBlob,
  installSessionKey,
  type Permission,
  type DelegationRecord,
} from '../utils/crypto';
import { cloudStorageGetItem, cloudStorageSetItem } from '../utils/telegramStorage';
import { toErrorMessage } from '../utils/toErrorMessage';

const STORAGE_KEY = 'delegated_key';

const DEFAULT_PERMISSIONS: Permission[] = [{
  tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  maxAmount: '1000000000000000000',
  validUntil: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
}];

type Action =
  | { type: 'NEEDS_CREATE' }
  | { type: 'NEEDS_UNLOCK'; error?: string }
  | { type: 'PROCESSING'; step: string }
  | { type: 'DONE'; record: DelegationRecord }
  | { type: 'ERROR'; message: string };

function reducer(_: DelegationState, action: Action): DelegationState {
  switch (action.type) {
    case 'NEEDS_CREATE': return { status: 'needs_password', mode: 'create' };
    case 'NEEDS_UNLOCK': return { status: 'needs_password', mode: 'unlock', error: action.error };
    case 'PROCESSING': return { status: 'processing', step: action.step };
    case 'DONE': return { status: 'done', record: action.record };
    case 'ERROR': return { status: 'error', message: action.message };
  }
}

export function useDelegatedKey(options: {
  smartAccountAddress: string;
  signerAddress: string;
  signerWallet: ConnectedWallet | undefined;
}): {
  state: DelegationState;
  submitPassword: (password: string) => void;
} {
  const { smartAccountAddress, signerAddress, signerWallet } = options;
  const [state, dispatch] = React.useReducer(reducer, { status: 'idle' });

  // Holds the encrypted CloudStorage value across create/unlock flows
  const encryptedBlobRef = React.useRef<string | null>(null);

  // Check CloudStorage once the smart account address is known
  React.useEffect(() => {
    if (!smartAccountAddress) return;
    (async () => {
      try {
        const existing = await cloudStorageGetItem(STORAGE_KEY);
        if (existing) {
          encryptedBlobRef.current = existing;
          dispatch({ type: 'NEEDS_UNLOCK' });
        } else {
          dispatch({ type: 'NEEDS_CREATE' });
        }
      } catch (err) {
        dispatch({ type: 'ERROR', message: toErrorMessage(err) });
      }
    })();
  }, [smartAccountAddress]);

  const submitPassword = React.useCallback(
    async (password: string) => {
      dispatch({ type: 'PROCESSING', step: 'Preparing…' });
      try {
        const zerodevRpc = (import.meta.env.VITE_ZERODEV_RPC as string) ?? '';
        if (!zerodevRpc) throw new Error('VITE_ZERODEV_RPC is not set');

        let serializedBlob: string;
        let record: DelegationRecord;

        if (encryptedBlobRef.current) {
          // ── UNLOCK: decrypt the stored blob and reconstruct public record ────────
          dispatch({ type: 'PROCESSING', step: 'Decrypting session key…' });
          try {
            serializedBlob = await decryptBlob(encryptedBlobRef.current, password);
          } catch {
            dispatch({ type: 'NEEDS_UNLOCK', error: 'Wrong password, please try again' });
            return;
          }

          // The record metadata was posted to the backend at creation time.
          // On unlock we only need the public fields for the debug panel.
          // Fetch from backend so we don't need to store them separately.
          const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';
          // We derive the session key address from the blob via deserializePermissionAccount
          // for the purpose of the debug panel — handled in a future step.
          // For now, emit done with minimal info; the client is ready to sign.
          dispatch({ type: 'PROCESSING', step: 'Session key ready.' });

          // TODO (future): call createSessionKeyClient(serializedBlob, zerodevRpc) here
          // and store the client in a ref so other components can call sendUserOperation.

          // Reconstruct a minimal record for the debug panel from CloudStorage metadata.
          // Full record can be fetched from backend via GET /permissions?public_key=address.
          // For now, dispatch done with whatever we have.
          record = {
            publicKey: '',         // fetched from backend in future step
            address: '0x',         // fetched from backend in future step
            smartAccountAddress: smartAccountAddress as `0x${string}`,
            signerAddress: signerAddress as `0x${string}`,
            permissions: DEFAULT_PERMISSIONS,
            grantedAt: 0,
          };
          dispatch({ type: 'DONE', record });
          return;
        }

        // ── CREATE: generate keypair → install on-chain → encrypt → store ─────────
        dispatch({ type: 'PROCESSING', step: 'Generating session keypair…' });
        const keypair = generateKeypair();

        if (!signerWallet) throw new Error('Privy embedded wallet not found');
        const provider = await signerWallet.getEthereumProvider();

        dispatch({ type: 'PROCESSING', step: 'Installing session key on-chain… (approve in Privy popup)' });
        serializedBlob = await installSessionKey(
          provider as Parameters<typeof installSessionKey>[0],
          signerAddress as `0x${string}`,
          keypair.privateKey,
          keypair.address,
          zerodevRpc,
        );

        // Encrypt the serialized blob (which contains the private key) before persisting
        dispatch({ type: 'PROCESSING', step: 'Encrypting and storing session key…' });
        const encryptedBlob = await encryptBlob(serializedBlob, password);
        await cloudStorageSetItem(STORAGE_KEY, encryptedBlob);
        encryptedBlobRef.current = encryptedBlob;

        // Build the public delegation record — no private key, no serialized blob
        record = {
          publicKey: keypair.publicKey,
          address: keypair.address,
          smartAccountAddress: smartAccountAddress as `0x${string}`,
          signerAddress: signerAddress as `0x${string}`,
          permissions: DEFAULT_PERMISSIONS,
          grantedAt: Math.floor(Date.now() / 1000),
        };

        // POST public metadata to backend
        dispatch({ type: 'PROCESSING', step: 'Persisting public metadata to backend…' });
        const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';
        try {
          const resp = await fetch(`${backendUrl}/persistent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),   // serializedBlob is NOT included
          });
          if (!resp.ok) console.warn('[Delegation] Backend /persistent returned', resp.status);
        } catch (fetchErr) {
          console.warn('[Delegation] Could not reach backend /persistent:', toErrorMessage(fetchErr));
        }

        // Debug logging
        console.log('[Delegation] Keypair:', { address: record.address, publicKey: record.publicKey });
        console.log('[Delegation] Permissions:', record.permissions);
        console.log('[Delegation] Session key installed on-chain. Blob encrypted and stored in CloudStorage.');

        dispatch({ type: 'DONE', record });
      } catch (err) {
        dispatch({ type: 'ERROR', message: toErrorMessage(err) });
      }
    },
    [smartAccountAddress, signerAddress, signerWallet],
  );

  return { state, submitPassword };
}

export type { DelegationState, DelegationRecord } from '../utils/crypto';
```

**Note on the unlock path**: The minimal record shown in the debug panel on unlock is a known gap. A follow-up step should call `GET /permissions?public_key={address}` from the backend (which requires knowing the session key address). The address can be recovered by calling `deserializePermissionAccount` and reading `account.address`. This is left as a `TODO` comment in the hook because `createSessionKeyClient` (which calls `deserializePermissionAccount`) is the natural place to get it, and wiring that up is part of the UserOp submission feature — not the onboarding flow.

---

## Next part

Continue with **Part 4**: Steps 9–10 (modifying `src/App.tsx`, env vars) plus dev mock, security notes, and future work.
