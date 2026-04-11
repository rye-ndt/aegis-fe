# Delegation Control — FE Plan

## Goal
After the Telegram bot prompts the user to approve a delegation, the mini app fetches the pending delegation request and calls ZeroDev + Privy to install the session key with the exact permission scoped by the BE.

---

## New: ZeroDev Message Type Enum + Schemas (mirrors BE)

**`src/utils/zerodevMessage.types.ts`**
```typescript
export enum ZerodevMessageType {
  ERC20_SPEND = 'ERC20_SPEND',
  // future: NATIVE_SPEND, CALL_CONTRACT, ...
}

// One schema interface per enum value.
// Field names mirror @zerodev/permissions/policies so the FE passes them through with no renaming.
export interface Erc20SpendMessage {
  type: ZerodevMessageType.ERC20_SPEND;
  sessionKeyAddress: `0x${string}`;
  target: `0x${string}`;      // ERC20 contract — maps to Permission.target
  valueLimit: string;          // BigInt decimal string — maps to ConditionValue.value (BigInt() before use)
  validUntil: number;          // unix epoch — maps to TimestampPolicyParams.validUntil
  chainId: number;
}

// Discriminated union — add new types here
export type ZerodevMessage = Erc20SpendMessage;
```

---

## Change: `crypto.ts` — policy-aware session key installation

Replace the hardcoded `toSudoPolicy` with a policies array param.
`toPermissionValidator` takes `policies: Policy[]`, so the signature mirrors that:

```typescript
// NEW: policy-scoped install (replaces installSessionKey's toSudoPolicy)
export async function installSessionKeyWithPolicy(
  provider: EIP1193Provider,
  signerAddress: `0x${string}`,
  sessionPrivateKey: `0x${string}`,
  sessionKeyAddress: `0x${string}`,
  policies: Policy[],          // from @zerodev/permissions/policies — passed directly to toPermissionValidator
  zerodevRpc: string,
): Promise<string>
```

**ERC20_SPEND policy builder** (in `crypto.ts`):

Maps one `Erc20SpendMessage` → two ZeroDev policies that go into `installSessionKeyWithPolicy`:

```typescript
import {
  toCallPolicy,
  toTimestampPolicy,
  CallPolicyVersion,
  ParamCondition,
} from '@zerodev/permissions/policies';
import type { Policy } from '@zerodev/permissions';
import { erc20Abi } from 'viem';

// Returns Policy[] — both call policy (what) and timestamp policy (until when)
// are required; toPermissionValidator receives them as a single flat array.
export function buildErc20SpendPolicies(
  target: `0x${string}`,  // msg.target — passed directly to Permission.target
  valueLimit: bigint,      // BigInt(msg.valueLimit) — caller converts from string
  validUntil: number,      // msg.validUntil — passed directly to TimestampPolicyParams.validUntil
): Policy[] {
  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_5,   // required field — latest stable
    permissions: [{
      target,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [
        null,                                                                   // recipient — no constraint (any address)
        { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: valueLimit },   // amount ≤ valueLimit
      ],
    }],
  });

  const timestampPolicy = toTimestampPolicy({ validUntil });

  return [callPolicy, timestampPolicy];
}
```

**Field mapping from `Erc20SpendMessage` → ZeroDev:**

Field names on the wire mirror ZeroDev's types exactly — zero renaming on the FE.

| Message field       | ZeroDev destination                          | Transformation              |
|---------------------|----------------------------------------------|-----------------------------|
| `target`            | `Permission.target`                          | none                        |
| `valueLimit`        | `args[1].value` in `toCallPolicy`            | `BigInt(valueLimit)`        |
| `validUntil`        | `toTimestampPolicy({ validUntil })`          | none                        |
| `sessionKeyAddress` | `addressToEmptyAccount(sessionKeyAddress)`   | none                        |
| `chainId`           | selects viem chain + bundler RPC             | none                        |

---

## New hook: `usePendingDelegation`

**`src/hooks/usePendingDelegation.ts`**

Polls `GET /delegation/pending` (with JWT from Privy token) every 3 s.

Returns:
```typescript
{
  pending: ZerodevMessage | null;
  approve: () => Promise<void>;   // calls installSessionKeyWithPolicy, then POST /delegation/:id/signed
  dismiss: () => void;
}
```

Flow inside `approve()`:
1. Decrypt session key blob from CloudStorage (reuse existing password dialog)
2. Derive `sessionPrivateKey` from blob
3. Build policies from message type:
   - `ERC20_SPEND` → `buildErc20SpendPolicies(target, BigInt(valueLimit), validUntil)`
     Returns `Policy[]` — both the call policy and the timestamp policy.
4. Call `installSessionKeyWithPolicy(provider, signerAddress, sessionPrivateKey, sessionKeyAddress, policies, zerodevRpc)`
5. `POST /delegation/:id/signed`
6. Clear pending state

---

## New component: `DelegationApprovalCard`

**`src/components/DelegationApprovalCard.tsx`**

Shown in `ConnectedView` when `usePendingDelegation` returns a non-null `pending`:

```
┌─────────────────────────────────┐
│ Delegation Request              │
│                                 │
│ Allow bot to spend up to        │
│ 0.5 WETH for 7 days             │
│ Token: 0xC02a…                  │
│ Expires: 2026-04-18             │
│                                 │
│  [Approve]      [Dismiss]       │
└─────────────────────────────────┘
```

---

## App.tsx change

Add `usePendingDelegation` to `ConnectedView`, pass `pending` + `approve` + `dismiss` to `DelegationApprovalCard`.

---

## Summary of new files

```
src/utils/zerodevMessage.types.ts
src/hooks/usePendingDelegation.ts
src/components/DelegationApprovalCard.tsx
```

Modified:
- `src/utils/crypto.ts` — `installSessionKeyWithPolicy` (takes `Policy[]`) + `buildErc20SpendPolicies` (returns `Policy[]`)
- `src/hooks/useDelegatedKey.ts` — switch create path to `installSessionKeyWithPolicy(toSudoPolicy)` for initial onboarding (keeps backward compat until delegation request overrides it)
- `src/App.tsx` — wire `DelegationApprovalCard`
