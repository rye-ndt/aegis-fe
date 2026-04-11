# Session Delegation — Frontend Implementation Plan

> Date: 2026-04-11  
> Status: Draft (v3 — client-side signing; backend stores public metadata only)  
> Touches: `src/telegram.d.ts`, `src/App.tsx`, new utils + hooks + components, `.env.local`

---

## Goal

After a user authenticates with Privy, the app:

1. Checks Telegram CloudStorage for `delegated_key`
2. If absent: prompts for a password → generates a secp256k1 keypair → installs a ZeroDev Kernel session key permission **on-chain** (user signs once via Privy popup) → encrypts the serialized permission account blob → stores encrypted blob in CloudStorage
3. If present: prompts to unlock → decrypts blob → reconstructs signing account via `deserializePermissionAccount`
4. POSTs **only public metadata** (address, public key, permissions, smart account address) to the backend — no private key, no serialized blob
5. When the agent needs to act on behalf of the user, the mini app decrypts the session key locally and submits UserOperations **directly to the ZeroDev bundler** — the backend never sees any private key material
6. Shows a debug panel with the keypair and permissions

The delegated key is **verifiable on-chain**: the Kernel smart contract enforces what the session key is permitted to do. The private key stays encrypted on the user's device in Telegram CloudStorage at all times.

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

## Architecture: where private key material lives

| Location | What it holds |
|---|---|
| Telegram CloudStorage (`delegated_key`) | AES-GCM encrypted serialized permission account blob (contains session private key) |
| React state / memory | Decrypted serialized blob (only while mini app is open and unlocked) |
| Backend Redis | Public delegation record — address, public key, permissions, smart account address — **no keys** |
| ZeroDev bundler | Receives signed UserOperations from the frontend |

The backend is never in the signing path. It stores metadata for the agent to know what a session key is authorized to do.

---

## Data model

Define these types in `src/utils/crypto.ts`. Import from there everywhere else.

```typescript
export type Permission = {
  tokenAddress: `0x${string}`;   // ERC-20 address or native sentinel
  maxAmount: string;              // wei as decimal string
  validUntil: number;             // Unix epoch seconds
};

// Sent to the backend — public metadata only, no private key
export type DelegationRecord = {
  publicKey: string;                    // 0x-prefixed compressed secp256k1 public key
  address: `0x${string}`;              // Ethereum address derived from the session keypair
  smartAccountAddress: `0x${string}`; // User's Kernel smart account address
  signerAddress: `0x${string}`;        // User's Privy embedded wallet (EOA)
  permissions: Permission[];
  grantedAt: number;                   // Unix epoch seconds
};

// Keypair used internally during generation; privateKey is never stored raw
export type Keypair = {
  privateKey: `0x${string}`;
  publicKey: string;
  address: `0x${string}`;
};
```

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
| `viem` | Public client + wallet client + `privateKeyToAccount` |
| `permissionless` | `walletClientToSmartAccountSigner` — bridges Privy wallet → ZeroDev signer |
| `@zerodev/sdk` | `createKernelAccount`, `createKernelAccountClient`, `addressToEmptyAccount` |
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

Four responsibilities: keypair generation, AES-GCM encryption/decryption, ZeroDev session key installation, ZeroDev signing account reconstruction.

### 5a — Types (at the top of the file)

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
```

### 5c — Encryption (AES-GCM + PBKDF2, browser native Web Crypto)

These functions encrypt and decrypt any string blob — used to protect the serialized session key stored in CloudStorage.

Blob layout: `[16 bytes salt][12 bytes iv][ciphertext]`, base64-encoded.

```typescript
export async function encryptBlob(data: string, password: string): Promise<string> {
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
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(data),
  );
  const result = new Uint8Array(16 + 12 + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, 16);
  result.set(new Uint8Array(ciphertext), 28);
  return btoa(String.fromCharCode(...result));
}

export async function decryptBlob(encrypted: string, password: string): Promise<string> {
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

Installs the session key permission on the user's Kernel smart account. The user signs once (Privy popup appears automatically). Returns the **serialized permission account blob** — a base64 string that embeds the session private key and can reconstruct a full signing account via `deserializePermissionAccount`.

This blob is encrypted and stored in CloudStorage. It is **never sent to the backend**.

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

  // 3. Public client pointing at the ZeroDev bundler RPC
  const publicClient = createPublicClient({
    transport: http(zerodevRpc),
    chain: avalancheFuji,
  });

  const entryPoint = getEntryPoint('0.7');
  const kernelVersion = KERNEL_V3_1;

  // 4. ECDSA validator — Privy EOA is the Kernel account owner
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer: privySigner,
    kernelVersion,
  });

  // 5. Build the permission plugin using only the session key's *address* (no private key needed here)
  const emptySessionAccount = addressToEmptyAccount(sessionKeyAddress);
  const emptySessionKeySigner = await toECDSASigner({ signer: emptySessionAccount });

  // 6. toSudoPolicy grants full access — replace with toCallPolicy in production
  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: emptySessionKeySigner,
    policies: [toSudoPolicy({})],
    kernelVersion,
  });

  // 7. Kernel account with both owner (sudo) and session key (regular) plugins
  const sessionKeyAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,       // Owner (Privy EOA) — signs this setup UserOp
      regular: permissionPlugin,  // Session key — validates all future autonomous actions
    },
    kernelVersion,
  });

  // 8. Serialize with the session private key embedded.
  //    This triggers the Privy popup — the owner signs the UserOp that installs the plugin on-chain.
  //    The returned blob is stored encrypted in CloudStorage; it is never sent to the backend.
  return await serializePermissionAccount(sessionKeyAccount, sessionPrivateKey);
}
```

### 5e — Signing account reconstruction (for future UserOp submission)

After the user unlocks their CloudStorage and decrypts the blob, this function reconstructs a live `KernelAccountClient` ready to submit UserOperations directly to the ZeroDev bundler. No Privy interaction required — the session key signs autonomously.

```typescript
import { createKernelAccountClient } from '@zerodev/sdk';
import { deserializePermissionAccount } from '@zerodev/permissions';
import type { KernelAccountClient } from '@zerodev/sdk';

export async function createSessionKeyClient(
  serializedBlob: string,
  zerodevRpc: string,
): Promise<KernelAccountClient> {
  const publicClient = createPublicClient({
    transport: http(zerodevRpc),
    chain: avalancheFuji,
  });
  const entryPoint = getEntryPoint('0.7');

  // Reconstructs the full KernelSmartAccount from the serialized blob.
  // The blob contains the session private key and all on-chain permission proof data.
  const account = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    KERNEL_V3_1,
    serializedBlob,
  );

  return createKernelAccountClient({
    account,
    chain: avalancheFuji,
    bundlerTransport: http(zerodevRpc),
    entryPoint,
  });
}
```

Usage — submit a UserOp from the frontend:

```typescript
const client = await createSessionKeyClient(decryptedBlob, zerodevRpc);
const txHash = await client.sendUserOperation({
  callData: await client.account.encodeCalls([{
    to: targetAddress,
    value: 0n,
    data: encodedCalldata,
  }]),
});
```

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
