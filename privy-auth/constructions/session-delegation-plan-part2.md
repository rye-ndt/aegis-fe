# Session Delegation — Part 2 of 4
# Steps covered: Step 4 (telegramStorage.ts) · Step 5 (crypto.ts)

> Part of: session-delegation-plan.md  
> Date: 2026-04-11  
> Prerequisite: Part 1 completed (deps installed, `telegram.d.ts` updated, `toErrorMessage.ts` created)

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

## Next part

Continue with **Part 3**: Steps 6–8 (`PasswordDialog.tsx`, `DelegationDebugPanel.tsx`, `useDelegatedKey.ts`).
