import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { toOwner } from 'permissionless/utils';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { createKernelAccount, createKernelAccountClient, addressToEmptyAccount, createZeroDevPaymasterClient } from '@zerodev/sdk';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { toECDSASigner } from '@zerodev/permissions/signers';
import { toPermissionValidator, serializePermissionAccount, deserializePermissionAccount } from '@zerodev/permissions';
import { toSudoPolicy } from '@zerodev/permissions/policies';
import type { EIP1193Provider } from 'viem';
import type { KernelAccountClient } from '@zerodev/sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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


// ---------------------------------------------------------------------------
// Keypair generation
// ---------------------------------------------------------------------------

export function generateKeypair(): Keypair {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, publicKey: account.publicKey, address: account.address };
}

// ---------------------------------------------------------------------------
// AES-GCM encryption / decryption
// Blob layout: [16 bytes salt][12 bytes iv][ciphertext], base64-encoded
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ZeroDev session key installation
// ---------------------------------------------------------------------------

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
  const privySigner = await toOwner({ owner: walletClient });

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


// ---------------------------------------------------------------------------
// Signing account reconstruction (for future UserOp submission)
// ---------------------------------------------------------------------------

export async function createSessionKeyClient(
  serializedBlob: string,
  zerodevRpc: string,
  paymasterUrl?: string,
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

  const paymasterClient = paymasterUrl
    ? createZeroDevPaymasterClient({ chain: avalancheFuji, transport: http(paymasterUrl) })
    : null;

  return createKernelAccountClient({
    account,
    chain: avalancheFuji,
    bundlerTransport: http(zerodevRpc),
    ...(paymasterClient && {
      paymaster: {
        getPaymasterData: paymasterClient.getPaymasterData,
        getPaymasterStubData: paymasterClient.getPaymasterStubData,
      },
    }),
  });
}
