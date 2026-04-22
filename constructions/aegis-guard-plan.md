# Aegis Guard — Frontend Plan

## Overview

Add an Aegis Guard toggle to the app UI. When the user enables it, a modal appears showing their current token balances, letting them set a cumulative spending limit and expiry per token. The app then installs an on-chain ZeroDev session key scoped to those ERC20 limits (gas sponsored via paymaster), posts the grant metadata to the backend, and saves the preference. All Web3 complexity is hidden from the user.

---

## 1. New Environment Variable

File: `.env` (and `vite-env.d.ts`)

```
VITE_PAYMASTER_URL=<zerodev-or-pimlico-paymaster-rpc-url>
```

Add to `ImportMetaEnv` in `vite-env.d.ts`:
```typescript
readonly VITE_PAYMASTER_URL: string;
```

The paymaster must be configured (in the Pimlico/ZeroDev dashboard) to whitelist:
- The ZeroDev kernel factory address
- The session key manager address
- All ERC20 token contract addresses expected in the system

---

## 2. Modify `crypto.ts` — Add `installSessionKeyWithErc20Limits`

File: `src/utils/crypto.ts`

Add a new exported function alongside the existing `installSessionKey`:

```typescript
export interface Erc20SpendingLimit {
  tokenAddress: Address;
  limitWei: bigint;
  validUntil: number; // unix epoch seconds
}

export async function installSessionKeyWithErc20Limits(
  keypairPrivateKey: Hex,
  provider: EIP1193Provider,
  limits: Erc20SpendingLimit[],
  paymasterUrl: string,
): Promise<string> // returns serialized permission account blob
```

Internal steps (mirror `installSessionKey` structure, replace policy):

1. Create `ecdsaValidator` from Privy EOA (same as existing)
2. Create session key signer from `keypairPrivateKey`
3. Build **call policy** per token:
   ```typescript
   import { toCallPolicy, ParamCondition } from '@zerodev/permissions/policies'
   
   toCallPolicy({
     permissions: limits.map(limit => ({
       target: limit.tokenAddress,
       valueLimit: BigInt(0),
       abi: erc20Abi,          // standard ERC20 ABI (transfer function)
       functionName: 'transfer',
       args: [
         null,                 // recipient: unconstrained (agent decides)
         {
           condition: ParamCondition.LESS_THAN_OR_EQUAL,
           value: limit.limitWei,  // per-tx cap = total limit (Redis enforces cumulative)
         },
       ],
       validUntil: limit.validUntil,
       validAfter: 0,
     })),
   })
   ```
4. Create `permissionValidator` from session key signer + call policy (same as existing)
5. Create `kernelAccount` with `ecdsaValidator` as sudo + `permissionValidator`
6. Create `kernelClient` with **paymaster added**:
   ```typescript
   createKernelAccountClient({
     account: kernelAccount,
     chain,
     bundlerTransport: http(BUNDLER_URL),
     paymaster: createZeroDevPaymasterClient({
       chain,
       transport: http(paymasterUrl),
     }),
   })
   ```
7. Return `serializePermissionAccount(kernelAccount, keypairPrivateKey)`

The existing `installSessionKey` is left untouched. The serialized blob is stored back into CloudStorage (replacing the existing one) via the caller.

**Note**: The `validUntil` per permission entry in `toCallPolicy` enforces expiry on-chain. Redis TTL mirrors this for application-level cleanup.

---

## 3. New Hook — `useAegisGuard.ts`

File: `src/hooks/useAegisGuard.ts`

### Dependencies
- `useDelegatedKey` — to get `keypairRef` (existing keypair private key) and `keypairAddress`
- `usePrivy` — for `user`
- `useWallets` — to get the embedded wallet provider for `installSessionKeyWithErc20Limits`
- Backend API calls via `fetch`

### State Shape
```typescript
type AegisGuardState =
  | { phase: 'loading' }
  | { phase: 'idle'; enabled: boolean }
  | { phase: 'modal_open'; enabled: boolean }
  | { phase: 'submitting'; enabled: boolean }
  | { phase: 'error'; enabled: boolean; message: string }
```

### Exposed API
```typescript
{
  enabled: boolean;
  isModalOpen: boolean;
  isLoading: boolean;
  error: string | null;
  openModal: () => void;       // only callable when not enabled
  closeModal: () => void;
  disable: () => Promise<void>;
  grant: (tokenLimits: TokenLimit[]) => Promise<void>;
}
```

Where:
```typescript
interface TokenLimit {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  amountHuman: string;     // user-typed, e.g. "100.5"
  validUntil: Date;
}
```

### `grant` Flow (called by modal on confirm)

1. **Guard**: if no keypair exists in `useDelegatedKey`, throw — modal should have blocked this
2. Convert each `amountHuman` → `limitWei` using `tokenDecimals`:
   ```typescript
   const limitWei = parseUnits(amountHuman, tokenDecimals) // viem parseUnits
   ```
3. Get Privy embedded wallet provider from `useWallets`
4. Call `installSessionKeyWithErc20Limits(keypairPrivateKey, provider, limits, VITE_PAYMASTER_URL)`
   - This triggers ONE Privy wallet approval prompt (the UserOp for session key installation)
   - Gas is sponsored — user sees no gas amount
5. Store updated serialized blob back to CloudStorage (same key as `useDelegatedKey` uses)
6. `POST /aegis-guard/grant` with:
   ```json
   {
     "sessionKeyAddress": "<keypairAddress>",
     "smartAccountAddress": "<scaAddress>",
     "delegations": [
       {
         "tokenAddress": "0x...",
         "tokenSymbol": "USDC",
         "tokenDecimals": 6,
         "limitWei": "100000000",
         "validUntil": 1776000000
       }
     ]
   }
   ```
7. `POST /preference` with `{ "aegisGuardEnabled": true }`
8. Transition state to `idle` with `enabled: true`

### `disable` Flow

1. `POST /preference` with `{ "aegisGuardEnabled": false }`
2. Transition state to `idle` with `enabled: false`
3. **Note**: Does NOT revoke the on-chain session key. That is out of scope per the current plan. The on-chain permission remains until `validUntil` expires; Redis TTL mirrors it.

### On Mount

`GET /preference` → initialise `enabled` from backend response.

---

## 4. New Component — `AegisGuardModal.tsx`

File: `src/components/AegisGuardModal.tsx`

### Props
```typescript
{
  keypairAddress: string;
  scaAddress: string;
  jwtToken: string;
  onConfirm: (limits: TokenLimit[]) => void;
  onClose: () => void;
  isSubmitting: boolean;
}
```

### Behaviour

**On mount**: `GET /portfolio` (with JWT) → parse token balances.

**Render**:
```
┌─────────────────────────────────────────┐
│  Enable Aegis Guard                  ✕  │
│                                         │
│  Grant your session key permission to   │
│  spend tokens on your behalf.           │
│                                         │
│  Spending key: 0xABCD...1234            │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ USDC        Balance: 250.00     │    │
│  │ Limit  [__________] USDC        │    │
│  │ Until  [date picker]            │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ AVAX        Balance: 1.42       │    │
│  │ Limit  [__________] AVAX        │    │
│  │ Until  [date picker]            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Cancel]         [Enable Aegis Guard]  │
└─────────────────────────────────────────┘
```

**Validation** (before enabling the confirm button):
- At least one token must have a non-empty limit > 0
- `validUntil` must be in the future
- `amountHuman` must be a valid positive decimal number
- Warn (not block) if limit > current balance

**Tokens shown**: Only tokens with balance > 0 from `/portfolio`. If portfolio returns no tokens or fails to load, show an error state with a retry.

**Loading state**: Spinner while fetching portfolio.

---

## 5. New Component — `AegisGuardToggle.tsx`

File: `src/components/AegisGuardToggle.tsx`

### Props
```typescript
{
  enabled: boolean;
  isLoading: boolean;
  onEnable: () => void;   // opens modal
  onDisable: () => void;
}
```

Simple toggle switch. When `isLoading`, disable interaction and show a spinner. Label: "Aegis Guard". Show a subtitle: "Active" or "Off" depending on state.

No pop-over or tooltip required — keep it minimal.

---

## 6. Modify `App.tsx`

File: `src/App.tsx`

1. Import `useAegisGuard` and wire it up alongside the existing `useDelegatedKey` hook — pass `keypairAddress` and `scaAddress` from user profile.
2. Render `<AegisGuardToggle>` in the authenticated view, near the existing `DelegationDebugPanel`.
3. Render `<AegisGuardModal>` when `isModalOpen` is true.
4. Pass `useAegisGuard.grant` as `onConfirm` to the modal.

---

## 7. Dependency on `useDelegatedKey`

Aegis Guard requires the session keypair to already exist (created via `useDelegatedKey`'s CREATE flow). Handle the missing-keypair case in `AegisGuardToggle`:

- If `useDelegatedKey` state is `idle` (no keypair): render toggle as disabled with a tooltip: "Set up your session key first."
- If keypair exists: toggle is enabled normally.

Do NOT trigger keypair creation from inside Aegis Guard — keep concerns separate.

---

## 8. File Checklist

| Action | File |
|--------|------|
| Add env var | `.env`, `src/vite-env.d.ts` |
| New function | `src/utils/crypto.ts` — `installSessionKeyWithErc20Limits` |
| New hook | `src/hooks/useAegisGuard.ts` |
| New component | `src/components/AegisGuardModal.tsx` |
| New component | `src/components/AegisGuardToggle.tsx` |
| Modify | `src/App.tsx` — integrate toggle + modal |

---

## 9. Key Assumptions / Known Risks

| Item | Note |
|------|------|
| ZeroDev `toCallPolicy` + `validUntil` per permission | Needs verification against installed `@zerodev/permissions` version — check if `validUntil` is a field on the per-permission object or on the policy itself |
| Paymaster whitelist | Token contract addresses must be registered in the paymaster policy before the UserOp will be sponsored |
| `serializePermissionAccount` overwrites existing blob | Calling `installSessionKeyWithErc20Limits` will produce a new serialized blob; the old sudo-policy blob in CloudStorage is replaced. The agent must use the new blob going forward |
| `parseUnits` precision | Use viem's `parseUnits(amountHuman, decimals)` — do not use `parseFloat` or `Number()` on the amount string |
