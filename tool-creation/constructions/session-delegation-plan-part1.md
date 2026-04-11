# Session Delegation — Part 1 of 4
# Steps covered: Prerequisites · Architecture · Data model · Step 1 (deps) · Step 2 (telegram.d.ts) · Step 3 (toErrorMessage.ts)

> Part of: session-delegation-plan.md  
> Date: 2026-04-11  
> Status: Draft (v3 — client-side signing; backend stores public metadata only)  
> Touches: `src/telegram.d.ts`, new utils, `.env.local`

---

## Overall file creation order (full plan reference)

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

## What NOT to change

- `src/main.tsx` — no changes
- `src/index.css` — no changes
- Existing `AddressRow`, `TokenRow`, `LoadingSpinner`, `LoginView`, `ShieldIcon`, `GoogleIcon`, `usePrivySession` — all untouched

---

## Next part

Continue with **Part 2**: Steps 4–5 (`src/utils/telegramStorage.ts` and `src/utils/crypto.ts`).
