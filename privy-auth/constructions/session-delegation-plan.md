# Session Delegation — Frontend Implementation Plan

> Date: 2026-04-11  
> Status: Draft (v2 — ZeroDev on-chain session keys)  
> Touches: `src/telegram.d.ts`, `src/App.tsx`, new utils + hooks + components, `.env.local`

---

## Goal

After a user authenticates with Privy, the app:

1. Checks Telegram CloudStorage for `delegated_key`
2. If absent: prompts for a password → generates a secp256k1 keypair → encrypts private key → stores in CloudStorage
3. If present: prompts to unlock → decrypts
4. Uses the Privy embedded wallet (EOA) to install a **ZeroDev Kernel session key permission on-chain** — one UserOperation, user signs once via Privy's native popup, never again
5. Serializes the approved session key account (private key embedded in the blob) and POSTs it with the delegation record to the backend
6. The backend can now use `deserializePermissionAccount` to submit UserOps on behalf of the user **without any further user interaction**
7. Shows a debug panel with the keypair and permissions

The delegated key is **verifiable on-chain** and can independently sign UserOperations from the user's Kernel smart account within the permitted scope.

---

## Pre-requisites (do before writing code)

### 1. Privy Dashboard — set smart wallet type to Kernel

Go to https://dashboard.privy.io → your app → **Smart Wallets** → set implementation to **Kernel (ZeroDev)**.

This ensures the address computed by ZeroDev's `createKernelAccount` matches what `useSmartWallets().client.account.address` shows. If a different type is set, the addresses will not match and the session key will be installed on the wrong account.

### 2. ZeroDev project — get a bundler RPC URL

Sign up at https://dashboard.zerodev.app → Create project → select **Avalanche Fuji** as the chain → copy the **Bundler + Paymaster** RPC URL. It looks like:

```
https://rpc.zerodev.app/api/v2/bundler/{projectId}
```

This becomes `VITE_ZERODEV_RPC` in `.env.local`.

---

## Data model

Define these types in `src/utils/crypto.ts`. Import from there everywhere else.

```typescript
export type Permission = {
  tokenAddress: `0x${string}`;   // ERC-20 address or native sentinel
  maxAmount: string;              // wei as decimal string
  validUntil: number;             // Unix epoch seconds
};

export type DelegationRecord = {
  publicKey: string;                    // 0x-prefixed compressed secp256k1 public key
  address: `0x${string}`;              // Ethereum address derived from keypair
  smartAccountAddress: `0x${string}`; // User's Kernel smart account address
  signerAddress: `0x${string}`;        // User's Privy embedded wallet (EOA)
  permissions: Permission[];
  serializedSessionKey: string;        // Output of serializePermissionAccount() — includes private key
  grantedAt: number;                   // Unix epoch seconds
};
```

`serializedSessionKey` is a base64-encoded blob produced by ZeroDev's `serializePermissionAccount(account, privateKey)`. It embeds the session private key and the full permission plugin configuration. The backend passes this to `deserializePermissionAccount` to get a live signing account with no user interaction required.

**Hardcoded dev permissions** (one entry, used on first-time generation):

```typescript
const DEFAULT_PERMISSIONS: Permission[] = [{
  tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // native AVAX sentinel
  maxAmount: '1000000000000000000',                            // 1 AVAX
  validUntil: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
}];
```

---

## Step 1 — Install dependencies

Run from `mini-apps/privy-auth/`:

```bash
npm install viem permissionless @zerodev/sdk @zerodev/ecdsa-validator @zerodev/permissions
```

| Package | Purpose |
|---|---|
| `viem` | Public client + wallet client |
| `permissionless` | `walletClientToSmartAccountSigner` — bridges Privy wallet → ZeroDev signer |
| `@zerodev/sdk` | `createKernelAccount`, `addressToEmptyAccount` |
| `@zerodev/ecdsa-validator` | `signerToEcdsaValidator` |
| `@zerodev/permissions` | `toPermissionValidator`, `serializePermissionAccount`, `deserializePermissionAccount` |

`@zerodev/permissions/signers` and `@zerodev/permissions/policies` are sub-paths of the `@zerodev/permissions` package, not separate installs.

---

## Step 2 — Update `src/telegram.d.ts`

The existing file does not declare `CloudStorage`. Add before `interface TelegramWebApp`:

```typescript
interface TelegramCloudStorageValues {
  [key: string]: string;
}

interface TelegramCloudStorage {
  setItem(
    key: string,
    value: string,
    callback?: (error: string | null, stored: boolean) => void,
  ): void;
  getItem(key: string, callback: (error: string | null, value: string) => void): void;
  getItems(
    keys: string[],
    callback: (error: string | null, values: TelegramCloudStorageValues) => void,
  ): void;
  removeItem(key: string, callback?: (error: string | null, removed: boolean) => void): void;
  getKeys(callback: (error: string | null, keys: string[]) => void): void;
}
```

Add inside `interface TelegramWebApp`:

```typescript
  CloudStorage: TelegramCloudStorage;
```

No other changes to this file.

---

## Step 3 — Create `src/utils/toErrorMessage.ts`

```typescript
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
```

---

## Step 4 — Create `src/utils/telegramStorage.ts`

Promisifies CloudStorage. Throws hard if unavailable — do not silently fall back.

```typescript
function getCloudStorage(): TelegramCloudStorage {
  const cs = window.Telegram?.WebApp?.CloudStorage;
  if (!cs) {
    throw new Error(
      'Telegram CloudStorage is not available. This app must run inside Telegram.',
    );
  }
  return cs;
}

export function cloudStorageGetItem(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    getCloudStorage().getItem(key, (error, value) => {
      if (error) return reject(new Error(error));
      resolve(value === '' ? null : value);
    });
  });
}

export function cloudStorageSetItem(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getCloudStorage().setItem(key, value, (error, stored) => {
      if (error) return reject(new Error(error));
      if (!stored) return reject(new Error(`CloudStorage refused to store key "${key}"`));
      resolve();
    });
  });
}
```

---

## Step 5 — Create `src/utils/crypto.ts`

Three responsibilities: keypair generation, AES-GCM encryption/decryption, ZeroDev session key installation.

### 5a — Types (at the top of the file, before imports)

```typescript
export type Permission = {
  tokenAddress: `0x${string}`;
  maxAmount: string;
  validUntil: number;
};

export type DelegationRecord = {
  publicKey: string;
  address: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  signerAddress: `0x${string}`;
  permissions: Permission[];
  serializedSessionKey: string;
  grantedAt: number;
};

export type Keypair = {
  privateKey: `0x${string}`;
  publicKey: string;
  address: `0x${string}`;
};
```

### 5b — Keypair generation

```typescript
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export function generateKeypair(): Keypair {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, publicKey: account.publicKey, address: account.address };
}

export function keypairFromPrivateKey(privateKey: `0x${string}`): Keypair {
  const account = privateKeyToAccount(privateKey);
  return { privateKey, publicKey: account.publicKey, address: account.address };
}
```

### 5c — Encryption (AES-GCM + PBKDF2, browser native Web Crypto)

Blob layout: `[16 bytes salt][12 bytes iv][ciphertext]`, base64-encoded.

```typescript
export async function encryptPrivateKey(privateKey: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(privateKey),
  );
  const result = new Uint8Array(16 + 12 + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, 16);
  result.set(new Uint8Array(ciphertext), 28);
  return btoa(String.fromCharCode(...result));
}

export async function decryptPrivateKey(encrypted: string, password: string): Promise<string> {
  const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ciphertext = bytes.slice(28);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Decryption failed — wrong password');
  }
}
```

### 5d — ZeroDev session key installation

This is the core on-chain step. It installs the session key permission on the user's Kernel smart account. The user signs once (Privy popup appears automatically). The output `serializedSessionKey` can be given to the backend to submit UserOps indefinitely without user interaction.

```typescript
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { walletClientToSmartAccountSigner } from 'permissionless';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import {
  createKernelAccount,
  addressToEmptyAccount,
} from '@zerodev/sdk';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { toECDSASigner } from '@zerodev/permissions/signers';
import { toPermissionValidator, serializePermissionAccount } from '@zerodev/permissions';
import { toSudoPolicy } from '@zerodev/permissions/policies';
import type { EIP1193Provider } from 'viem';

export async function installSessionKey(
  provider: EIP1193Provider,
  signerAddress: `0x${string}`,
  sessionPrivateKey: `0x${string}`,
  sessionKeyAddress: `0x${string}`,
  zerodevRpc: string,
): Promise<string> {
  // 1. Build a viem WalletClient backed by the Privy embedded wallet provider
  const walletClient = createWalletClient({
    account: signerAddress,
    chain: avalancheFuji,
    transport: custom(provider as Parameters<typeof custom>[0]),
  });

  // 2. Convert to a ZeroDev-compatible SmartAccountSigner
  const privySigner = walletClientToSmartAccountSigner(walletClient);

  // 3. Public client pointing at the ZeroDev bundler RPC (also serves as node RPC)
  const publicClient = createPublicClient({
    transport: http(zerodevRpc),
    chain: avalancheFuji,
  });

  const entryPoint = getEntryPoint('0.7');
  const kernelVersion = KERNEL_V3_1;

  // 4. Create the ECDSA validator from the Privy EOA — this IS the account owner
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer: privySigner,
    kernelVersion,
  });

  // 5. Create an empty account from only the session key's *address* (no private key needed here)
  const emptySessionAccount = addressToEmptyAccount(sessionKeyAddress);
  const emptySessionKeySigner = await toECDSASigner({ signer: emptySessionAccount });

  // 6. Build the permission plugin that defines what the session key is allowed to do
  //    toSudoPolicy grants full access — replace with toCallPolicy for tighter restrictions in production
  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: emptySessionKeySigner,
    policies: [toSudoPolicy({})],
    kernelVersion,
  });

  // 7. Create the Kernel account with both the owner (sudo) and session key (regular) plugins
  //    When the session key later sends a UserOp, Kernel uses the `regular` plugin to validate it
  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,       // Owner (Privy EOA) — signs this setup UserOp
      regular: permissionPlugin,  // Session key — used for all future autonomous actions
    },
    kernelVersion,
  });

  // 8. Serialize with the session private key embedded
  //    This triggers the Privy popup — the owner must sign the UserOp that installs the plugin
  //    After this, the session key can act autonomously with no further user interaction
  return await serializePermissionAccount(sessionKeyAccount, sessionPrivateKey);
}
```

**What happens on-chain**: The first time `serializePermissionAccount` (or the first session key UserOp) is submitted, the bundler sends a UserOperation that deploys the Kernel account (if not already deployed) and installs the permission plugin in the same tx. The Privy UI popup appears exactly once for the user to sign.

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
      <DebugRow
        label="Serialized Session Key (truncated)"
        value={record.serializedSessionKey.slice(0, 40) + '…'}
      />

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
  | { status: 'processing'; step: string }   // step: human-readable progress label
  | { status: 'done'; record: DelegationRecord }
  | { status: 'error'; message: string };
```

The `processing.step` is shown in the UI so the user knows what's happening (the ZeroDev installation triggers a Privy popup; the user should understand why).

### Full hook

```typescript
import React from 'react';
import type { ConnectedWallet } from '@privy-io/react-auth';
import {
  generateKeypair,
  keypairFromPrivateKey,
  encryptPrivateKey,
  decryptPrivateKey,
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

type State = DelegationState;
type Action =
  | { type: 'NEEDS_CREATE' }
  | { type: 'NEEDS_UNLOCK'; error?: string }
  | { type: 'PROCESSING'; step: string }
  | { type: 'DONE'; record: DelegationRecord }
  | { type: 'ERROR'; message: string };

function reducer(_: State, action: Action): State {
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
  const encryptedRef = React.useRef<string | null>(null);

  // Check CloudStorage once the smart account address is known
  React.useEffect(() => {
    if (!smartAccountAddress) return;
    (async () => {
      try {
        const existing = await cloudStorageGetItem(STORAGE_KEY);
        if (existing) {
          encryptedRef.current = existing;
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
      dispatch({ type: 'PROCESSING', step: 'Preparing keys…' });
      try {
        let keypair: ReturnType<typeof generateKeypair>;

        if (encryptedRef.current) {
          // UNLOCK: decrypt existing key
          let privateKey: string;
          try {
            privateKey = await decryptPrivateKey(encryptedRef.current, password);
          } catch {
            dispatch({ type: 'NEEDS_UNLOCK', error: 'Wrong password, please try again' });
            return;
          }
          keypair = keypairFromPrivateKey(privateKey as `0x${string}`);
        } else {
          // CREATE: generate → encrypt → persist
          dispatch({ type: 'PROCESSING', step: 'Generating keypair…' });
          keypair = generateKeypair();
          const encrypted = await encryptPrivateKey(keypair.privateKey, password);
          await cloudStorageSetItem(STORAGE_KEY, encrypted);
          encryptedRef.current = encrypted;
        }

        // Install the session key on the Kernel smart account
        // This triggers the Privy UI popup asking the user to sign once
        dispatch({ type: 'PROCESSING', step: 'Installing session key on-chain… (approve in Privy popup)' });
        if (!signerWallet) throw new Error('Privy embedded wallet not found');
        const provider = await signerWallet.getEthereumProvider();
        const zerodevRpc = (import.meta.env.VITE_ZERODEV_RPC as string) ?? '';
        if (!zerodevRpc) throw new Error('VITE_ZERODEV_RPC is not set');

        const serializedSessionKey = await installSessionKey(
          provider as Parameters<typeof installSessionKey>[0],
          signerAddress as `0x${string}`,
          keypair.privateKey,
          keypair.address,
          zerodevRpc,
        );

        const permissions = DEFAULT_PERMISSIONS;
        const record: DelegationRecord = {
          publicKey: keypair.publicKey,
          address: keypair.address,
          smartAccountAddress: smartAccountAddress as `0x${string}`,
          signerAddress: signerAddress as `0x${string}`,
          permissions,
          serializedSessionKey,
          grantedAt: Math.floor(Date.now() / 1000),
        };

        // POST to backend
        dispatch({ type: 'PROCESSING', step: 'Persisting to backend…' });
        const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';
        try {
          const resp = await fetch(`${backendUrl}/persistent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          });
          if (!resp.ok) console.warn('[Delegation] Backend /persistent returned', resp.status);
        } catch (fetchErr) {
          console.warn('[Delegation] Could not reach backend /persistent:', toErrorMessage(fetchErr));
        }

        // Debug logging
        console.log('[Delegation] Keypair:', { address: record.address, publicKey: record.publicKey });
        console.log('[Delegation] Permissions:', record.permissions);
        console.log('[Delegation] Serialized session key (first 80 chars):', record.serializedSessionKey.slice(0, 80));

        dispatch({ type: 'DONE', record });
      } catch (err) {
        dispatch({ type: 'ERROR', message: toErrorMessage(err) });
      }
    },
    [smartAccountAddress, signerAddress, signerWallet],
  );

  return { state, submitPassword };
}

export type { DelegationRecord } from '../utils/crypto';
```

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

## File creation order

1. `npm install viem permissionless @zerodev/sdk @zerodev/ecdsa-validator @zerodev/permissions`
2. Edit `src/telegram.d.ts` — add CloudStorage types
3. Create `src/utils/toErrorMessage.ts`
4. Create `src/utils/telegramStorage.ts`
5. Create `src/utils/crypto.ts`
6. Create `src/components/PasswordDialog.tsx`
7. Create `src/components/DelegationDebugPanel.tsx`
8. Create `src/hooks/useDelegatedKey.ts`
9. Edit `src/App.tsx`
10. Add `VITE_BACKEND_URL` + `VITE_ZERODEV_RPC` to `.env.local`

---

## What NOT to change

- `src/main.tsx` — no changes
- `src/index.css` — no changes
- Existing `AddressRow`, `TokenRow`, `LoadingSpinner`, `LoginView`, `ShieldIcon`, `GoogleIcon`, `usePrivySession` — all untouched

---

## Dev-mode browser testing

Telegram CloudStorage is unavailable in a plain browser. Add a temporary mock at the top of `telegramStorage.ts`:

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

Remove before deploying to Telegram.

---

## Security note on `serializedSessionKey`

`serializePermissionAccount(account, sessionPrivateKey)` embeds the session key's private key in the serialized blob. The backend stores this in Redis. This means:

- Anyone with Redis access can extract the session key private key
- The session key is limited to the on-chain permissions you set (`toSudoPolicy` for now, `toCallPolicy` in production)
- For production: replace `toSudoPolicy` with `toCallPolicy` scoped to specific token addresses and amounts
- For production: consider encrypting the serialized blob before storing in Redis

---

## Expected debug output

Console after first successful setup:
```
[Delegation] Keypair: { address: '0x1234...', publicKey: '0x02ab...' }
[Delegation] Permissions: [{ tokenAddress: '0xEeee...', maxAmount: '1000000000000000000', validUntil: 1749... }]
[Delegation] Serialized session key (first 80 chars): eyJhY2NvdW50QWRkcmVzcyI6IjB4...
```

UI (DelegationDebugPanel):
```
DEBUG — DELEGATION KEY (ON-CHAIN SESSION KEY ACTIVE)

DELEGATED ADDRESS      0x1234abcd...
PUBLIC KEY             0x02abc123...
SMART ACCOUNT          0x5678ef...
SIGNER (EOA)           0x9abc12...
SERIALIZED SESSION KEY (TRUNCATED)   eyJhY2NvdW50QWRkcmVzcyI6IjB4...

GRANTED PERMISSIONS
Token: 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
Max: 1000000000000000000 wei
Until: 2026-05-11T00:00:00.000Z
```
