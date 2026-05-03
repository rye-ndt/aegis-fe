# Plan: Self-derived Smart Account Address (FE)

**Status:** Planned
**Date:** 2026-05-03
**Scope:** Frontend only (`fe/privy-auth/`). Companion BE plan: `be/constructions/2026-05-03-self-derived-sca.md`. **Ship the BE plan first; this FE plan is gated on the BE verification (§4 of the BE plan) passing.**

---

## 1. Goal

Stop reading the user's SCA address from `useSmartWallets().client.account.address`. Compute it ourselves via the same Kernel V3.1 + ECDSA(EOA) stack `installSessionKey` already uses. Drop `SmartWalletsProvider`. Replace the two `client.sendTransaction` manual-sign call sites with a thin local Kernel client.

**Behavioral promise:** for every already-onboarded user the value of `smartAddress` is byte-identical to today, and every flow (auto-sign, manual-sign, install, reapproval, login, onramp) behaves identically. The only user-facing difference is none.

## 2. Non-goals

- No change to `installSessionKey` (already builds a local Kernel — this is the template we generalize from).
- No change to `createSessionKeyClient` / auto-sign path.
- No change to the encrypted-blob format, CloudStorage layout, or `useDelegatedKey` interface.
- No change to login flow, Telegram auto-login, Privy access token plumbing, or BE auth.
- No change to `useFundWallet` (card onramp). It comes from `@privy-io/react-auth`, not the smart-wallets sub-package; unaffected.
- No on-chain validator policy change (`toSudoPolicy({})` stays).

## 3. What's replaced vs. kept

| Surface | Today | After |
|---|---|---|
| `usePrivy()`, `loginWithTelegram`, `getAccessToken`, `useWallets()` | Privy (`@privy-io/react-auth`) | **kept verbatim** |
| `useFundWallet` (`OnrampHandler.tsx:14`) | Privy | **kept verbatim** |
| Pimlico bundler + paymaster (`crypto.ts:206-228`) | Pimlico | **kept verbatim** |
| `installSessionKey` (`crypto.ts:109-172`) — local Kernel build, Privy EOA signs install UserOp | Local | **kept verbatim** |
| `createSessionKeyClient` (`crypto.ts:179-239`) — auto-sign | Local | **kept verbatim** |
| **`smartAddress` source** in `App.tsx:49` | `useSmartWallets().client.account.address` | **`deriveScaAddress(eoaAddress, chainId)`** |
| **Manual-sign call** in `SignHandler.tsx:372` | `client.sendTransaction({...})` from `useSmartWallets()` | **`sudoClient.sendTransaction({...})`** built from Privy EOA EIP-1193 provider |
| **Manual-sign call** in `YieldDepositHandler.tsx:130` | same | same |
| `SmartWalletsProvider` wrapping in `main.tsx:35-38` | required | **removed** |
| Import of `@privy-io/react-auth/smart-wallets` | used | **removed everywhere** |

## 4. Verification gate (BLOCKING — inherited from BE plan)

Do not start FE work until the BE verification script (`be/constructions/2026-05-03-self-derived-sca.md` §4) reports 100% match across onboarded users for `AA_CONFIG.index = 0n`.

If the BE gate fails, this FE plan must be reconsidered or aborted. Shipping FE without the gate would silently reassign `smartAddress` for some users to addresses that disagree with their stored balances → effective fund loss in UX even if funds technically exist at the old address.

## 5. New module: `src/utils/aaConfig.ts`

Mirrors the BE module of the same name. Exact same constants — these MUST agree across FE and BE:

```ts
import { entryPoint07Address } from "viem/account-abstraction";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";

export const AA_CONFIG = {
  entryPointVersion: "0.7" as const,
  entryPointAddress: entryPoint07Address,
  kernelVersion: KERNEL_V3_1,
  /**
   * MUST match be/src/helpers/aaConfig.ts AA_CONFIG.index.
   * Pinned to 0n; verified against Privy's hosted-Kernel default.
   */
  index: 0n,
} as const;

export function getAaEntryPoint() {
  return getEntryPoint(AA_CONFIG.entryPointVersion);
}
```

A future cleanup (out of scope here) is to extract this and `chainConfig` into a shared package consumed by both repos so drift is prevented at the build level. For now, the two files stand as duplicates with a "MUST match" comment in each.

## 6. New module: `src/utils/deriveScaAddress.ts`

```ts
import { addressToEmptyAccount, createKernelAccount } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createPublicClient, http } from "viem";
import { AA_CONFIG, getAaEntryPoint } from "./aaConfig";
import { getChain, getRpcUrl } from "./chainConfig";  // existing helpers
import { createLogger } from "./logger";

const log = createLogger("deriveScaAddress");

let cache = new Map<string, `0x${string}`>();

export async function deriveScaAddress(
  eoa: `0x${string}`,
): Promise<`0x${string}`> {
  const chain = getChain();
  const cacheKey = `${chain.id}:${eoa.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl()),
  });
  const entryPoint = getAaEntryPoint();
  const ownerSigner = await addressToEmptyAccount(eoa);
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer: ownerSigner,
    kernelVersion: AA_CONFIG.kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: { sudo: ecdsaValidator },
    kernelVersion: AA_CONFIG.kernelVersion,
    index: AA_CONFIG.index,
  });

  log.debug('sca-derived', { eoa, sca: account.address });
  cache.set(cacheKey, account.address);
  return account.address;
}
```

`getChain()` and `getRpcUrl()` are already imported by `crypto.ts:15`. Reuse.

## 7. New module: `src/utils/createSudoClient.ts`

Replaces what `useSmartWallets().client` provided for manual-sign UserOps. Builds a `KernelAccountClient` with the Privy embedded wallet (EOA) as the sudo signer, wired to the same Pimlico bundler/paymaster as `createSessionKeyClient`.

```ts
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { toOwner } from "permissionless/utils";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { EIP1193Provider } from "viem";
import type { KernelAccountClient } from "@zerodev/sdk";
import { AA_CONFIG, getAaEntryPoint } from "./aaConfig";
import { getChain, getRpcUrl } from "./chainConfig";
import { createLogger } from "./logger";

const log = createLogger("createSudoClient");

export async function createSudoClient(
  provider: EIP1193Provider,
  signerAddress: `0x${string}`,
  bundlerRpc: string,
  paymasterUrl?: string,
  sponsorshipPolicyId?: string,
): Promise<KernelAccountClient> {
  const chain = getChain();
  const publicClient = createPublicClient({ chain, transport: http(getRpcUrl()) });
  const entryPoint = getAaEntryPoint();

  // Build a wallet client over the Privy EIP-1193 provider — same pattern as installSessionKey.
  const walletClient = createWalletClient({
    account: signerAddress,
    chain,
    transport: custom(provider as Parameters<typeof custom>[0]),
  });
  const ownerSigner = await toOwner({ owner: walletClient });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer: ownerSigner,
    kernelVersion: AA_CONFIG.kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: { sudo: ecdsaValidator },
    kernelVersion: AA_CONFIG.kernelVersion,
    index: AA_CONFIG.index,
  });

  const pimlicoClient = paymasterUrl
    ? createPimlicoClient({
        transport: http(paymasterUrl),
        entryPoint: { address: entryPoint07Address, version: "0.7" },
      })
    : null;
  const policyExt = sponsorshipPolicyId ? { sponsorshipPolicyId } : {};

  log.debug("creating sudo Kernel client", {
    signerAddress,
    sca: account.address,
    hasPaymaster: !!paymasterUrl,
  });

  return createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(bundlerRpc),
    ...(pimlicoClient && {
      paymaster: {
        getPaymasterData: (userOp) =>
          pimlicoClient.getPaymasterData({ ...userOp, ...policyExt }),
        getPaymasterStubData: (userOp) =>
          pimlicoClient.getPaymasterStubData({ ...userOp, ...policyExt }),
      },
      userOperation: {
        estimateFeesPerGas: async () =>
          (await pimlicoClient.getUserOperationGasPrice()).fast,
      },
    }),
  });
}
```

`createSudoClient` mirrors `createSessionKeyClient` (`crypto.ts:179-239`) but with Privy EOA as `sudo` instead of a deserialized session blob. Same Pimlico wiring; same `.sendTransaction({ to, value, data })` shape so call sites barely change.

## 8. File-level changes

### 8.1 `src/utils/aaConfig.ts` — new (§5)
### 8.2 `src/utils/deriveScaAddress.ts` — new (§6)
### 8.3 `src/utils/createSudoClient.ts` — new (§7)

### 8.4 `src/App.tsx` — replace `useSmartWallets()` read

Drop import line 4: `import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';`.

Drop line 29: `const { client } = useSmartWallets();`.

Replace line 49:

```ts
// before
const smartAddress = client?.account?.address ?? '';
```

with:

```ts
const [smartAddress, setSmartAddress] = React.useState('');
React.useEffect(() => {
  if (!eoaAddress) { setSmartAddress(''); return; }
  let cancelled = false;
  deriveScaAddress(eoaAddress as `0x${string}`)
    .then((sca) => { if (!cancelled) setSmartAddress(sca); })
    .catch((err) => log.error('derive-sca-failed', { err: toErrorMessage(err) }));
  return () => { cancelled = true; };
}, [eoaAddress]);
```

The downstream readers of `smartAddress` (`useDelegatedKey({ smartAccountAddress: smartAddress, ... })`, `<StatusView smartAddress={smartAddress} />`) require no change because they already accept `''` as a "not ready yet" state (e.g. `App.tsx:73`: `if (!authenticated || !smartAddress || !eoaAddress) return;`).

### 8.5 `src/components/handlers/SignHandler.tsx` — replace `useSmartWallets()` and the manual-sign call

Drop line 2 import: `import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';`.

Replace line 42 `const { client } = useSmartWallets();` with the props/state needed to build the sudo client lazily on demand:

```ts
import { useWallets } from '@privy-io/react-auth';
import { createSudoClient } from '../../utils/createSudoClient';

// inside the component:
const { wallets } = useWallets();
const embedded = wallets.find((w) => w.walletClientType === 'privy');
const sudoClientRef = React.useRef<KernelAccountClient | null>(null);

async function getSudoClient(): Promise<KernelAccountClient> {
  if (sudoClientRef.current) return sudoClientRef.current;
  if (!embedded) throw new Error('Embedded wallet not available');
  const provider = await embedded.getEthereumProvider();
  const c = await createSudoClient(
    provider,
    embedded.address as `0x${string}`,
    BUNDLER_URL,
    PAYMASTER_URL || undefined,
    SPONSORSHIP_ID || undefined,
  );
  sudoClientRef.current = c;
  return c;
}
```

Replace the manual-sign branch (line 372):

```ts
// before
const hash = await client.sendTransaction({
  to: currentRequest.to as `0x${string}`,
  value: BigInt(currentRequest.value),
  data: currentRequest.data as `0x${string}`,
  account: client.account!,
  chain: null,
});

// after
const sudoClient = await getSudoClient();
const hash = await sudoClient.sendTransaction({
  to: currentRequest.to as `0x${string}`,
  value: BigInt(currentRequest.value),
  data: currentRequest.data as `0x${string}`,
  account: sudoClient.account!,
  chain: null,
});
```

The `if (!client) throw new Error('Smart wallet not ready')` guard at line 370 changes to a check on `embedded`:

```ts
if (!embedded) throw new Error('Smart wallet not ready');
```

### 8.6 `src/components/handlers/YieldDepositHandler.tsx` — same pattern

Drop line 2 smart-wallets import. Replace `const { client } = useSmartWallets();` (line 36) with the same lazy `getSudoClient()` helper. Replace the `client.sendTransaction(...)` call at line 130 the same way as §8.5.

### 8.7 `src/main.tsx` — drop the provider

```diff
- import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets'
...
-     <SmartWalletsProvider>
-       <App />
-     </SmartWalletsProvider>
+     <App />
```

### 8.8 `package.json` — no removals

Do not remove `@privy-io/react-auth` — `usePrivy`, `useWallets`, `useFundWallet`, `loginWithTelegram` all still come from it. The `/smart-wallets` subpath is dropped from imports but the package is required.

### 8.9 No other changes

Untouched files:
- `crypto.ts` — `installSessionKey` and `createSessionKeyClient` unchanged
- `useDelegatedKey.ts` — unchanged (consumes `smartAccountAddress` as a string; agnostic to source)
- `ApprovalOnboarding.tsx`, `AuthHandler.tsx`, `ApproveHandler.tsx` — unchanged
- `OnrampHandler.tsx` — unchanged (`useFundWallet` not affected)
- `TelegramAutoLogin.tsx`, `views/login.tsx`, `hooks/privy.ts` — unchanged
- All other handlers, hooks, utils — unchanged

## 9. Migration order

1. Land §5-§7 (helpers) + tests. Self-contained, no behavior change yet (nothing imports them).
2. Test `deriveScaAddress(eoa)` in dev/staging against a known fixture (e.g., your own onboarded account) — must equal `useSmartWallets().client.account.address` for that account.
3. Confirm BE verification gate has passed (BE plan §4).
4. Land §8.4-§8.7 in a single commit. App now reads SCA from local derivation, manual sign goes through local sudo client, `SmartWalletsProvider` removed.
5. Smoke test in staging: login → home shows correct SCA → autoSign session-key install works → autoSign yield deposit works → manual sign request works → onramp opens correctly → reapproval flow works.
6. Production rollout. Watch logs for `derive-sca-failed` and any new sign-time errors. Compare derived addresses to BE-stored ones for the first day's logged-in users.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Derived address mismatches Privy's hosted address for an existing user → user sees wrong portfolio | BE verification gate (§4); per-user comparison logged on first auth post-cutover |
| `embedded.getEthereumProvider()` shape differs from Privy smart-wallets' provider | Pattern is already used by `installSessionKey:121` — proven to work end-to-end |
| `createSudoClient` is built lazily and the first call's signing prompt feels different from Privy's | Privy popup behavior is identical because the underlying signer is the same EOA via the same EIP-1193 provider |
| Session-key install now happens against an SCA address derived locally that wasn't in DB before | The install UserOp is signed by the EOA owner (sudo) and includes `initCode`; the resulting deployed contract is at the same deterministic address — no DB row needed at install time. After install, FE posts `record.smartAccountAddress` to the BE which writes the row (existing flow) |
| `useFundWallet` accidentally broken | Out of the change set; verify in smoke test anyway |

## 11. Rollback

- Revert §8.4-§8.7 commit. Reintroduce `SmartWalletsProvider` and `useSmartWallets()` reads. Helpers (§5-§7) can stay in tree as dead code; safe.
- DB and existing user state: untouched in either direction. No data migration.
- Encrypted blobs in CloudStorage: untouched. Session keys still work either way (the SCA address they install on is the same — that's what the verification gate proves).

## 12. Out of scope

- `toSudoPolicy({})` → `toCallPolicy(...)` swap (separate threat-model decision; would also benefit from a shared `aaConfig` value for the policy template)
- Multi-chain SCA simultaneity (currently single-chain per user)
- Extracting `aaConfig` + `chainConfig` into a shared cross-repo package
- Replacing `useFundWallet` with a non-Privy onramp
