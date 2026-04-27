import React from 'react';
import type { ConnectedWallet } from '@privy-io/react-auth';
import type { Hex } from 'viem';
import {
  generateKeypair,
  encryptBlob,
  decryptBlob,
  installSessionKey,
  type Permission,
  type DelegationRecord,
} from '../utils/crypto';
import {
  cloudStorageGetItem,
  cloudStorageSetItem,
  cloudStorageRemoveItem,
} from '../utils/telegramStorage';
import { toErrorMessage } from '../utils/toErrorMessage';
import { createLogger } from '../utils/logger';

const log = createLogger('useDelegatedKey');
const STORAGE_KEY = 'delegated_key';

// Placeholder — real per-token limits are enforced server-side via /delegation/grant.
const DEFAULT_PERMISSIONS: Permission[] = [
  {
    tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    maxAmount: '1000000000000000000',
    validUntil: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  },
];

export type DelegationState =
  | { status: 'idle' }
  | { status: 'processing'; step: string }
  | { status: 'done'; record: DelegationRecord }
  | { status: 'error'; message: string };

type Action =
  | { type: 'PROCESSING'; step: string }
  | { type: 'DONE'; record: DelegationRecord }
  | { type: 'ERROR'; message: string }
  | { type: 'IDLE' };

function reducer(_: DelegationState, action: Action): DelegationState {
  switch (action.type) {
    case 'PROCESSING': return { status: 'processing', step: action.step };
    case 'DONE':       return { status: 'done', record: action.record };
    case 'ERROR':      return { status: 'error', message: action.message };
    case 'IDLE':       return { status: 'idle' };
  }
}

type StoredKeypair = { privateKey: Hex; address: Hex };

function isUserRejection(err: unknown): boolean {
  if ((err as { code?: number })?.code === 4001) return true;
  return err instanceof Error && err.message.includes('User rejected');
}

export function useDelegatedKey(options: {
  smartAccountAddress: string;
  signerAddress: string;
  signerWallet: ConnectedWallet | undefined;
  privyDid: string; // deterministic derivation input — no user prompt
}): {
  state: DelegationState;
  start: () => void;
  unlock: () => void;
  removeKey: () => Promise<void>;
  serializedBlob: string | null;
} {
  const { smartAccountAddress, signerAddress, signerWallet, privyDid } = options;
  const [state, dispatch] = React.useReducer(reducer, { status: 'idle' });

  const [serializedBlob, setSerializedBlob] = React.useState<string | null>(null);
  const keypairRef = React.useRef<StoredKeypair | null>(null);

  const applyDecryptedBlob = React.useCallback((decrypted: string) => {
    let blob = decrypted;
    try {
      const wrapper = JSON.parse(decrypted);
      if (wrapper.privateKey) {
        keypairRef.current = {
          privateKey: wrapper.privateKey as Hex,
          address: (wrapper.address ?? '0x') as Hex,
        };
        if (wrapper.blob) blob = wrapper.blob;
      }
    } catch {
      // Legacy raw blob without keypair metadata — use as-is.
    }
    setSerializedBlob(blob);
  }, []);

  const buildRecord = React.useCallback((): DelegationRecord => ({
    publicKey: keypairRef.current?.address ?? '',
    address: (keypairRef.current?.address ?? '0x') as `0x${string}`,
    smartAccountAddress: smartAccountAddress as `0x${string}`,
    signerAddress: signerAddress as `0x${string}`,
    permissions: DEFAULT_PERMISSIONS,
    grantedAt: Math.floor(Date.now() / 1000),
  }), [smartAccountAddress, signerAddress]);

  // Tries to decrypt an existing stored blob; returns true on success.
  const tryRestore = React.useCallback(async (existing: string): Promise<boolean> => {
    dispatch({ type: 'PROCESSING', step: 'Decrypting session key…' });
    try {
      const decrypted = await decryptBlob(existing, privyDid);
      applyDecryptedBlob(decrypted);
      return true;
    } catch {
      return false;
    }
  }, [privyDid, applyDecryptedBlob]);

  const createAndStore = React.useCallback(async () => {
    dispatch({ type: 'PROCESSING', step: 'Generating session keypair…' });
    const keypair = generateKeypair();
    keypairRef.current = { privateKey: keypair.privateKey, address: keypair.address };
    log.debug('keypair-derived', { address: keypair.address });

    if (!signerWallet) throw new Error('Privy embedded wallet not found');
    const rawProvider = await signerWallet.getEthereumProvider();

    const bundlerRpc = (import.meta.env.VITE_PIMLICO_BUNDLER_URL as string) ?? '';
    if (!bundlerRpc) throw new Error('VITE_PIMLICO_BUNDLER_URL is not set');

    dispatch({ type: 'PROCESSING', step: 'Installing session key on-chain…' });
    let blob: string;
    try {
      blob = await installSessionKey(
        rawProvider as Parameters<typeof installSessionKey>[0],
        signerAddress as `0x${string}`,
        keypair.privateKey,
        keypair.address,
        bundlerRpc,
      );
    } catch (err) {
      log.error('session-key-install-failed', { address: keypair.address, err: toErrorMessage(err) });
      throw err;
    }
    setSerializedBlob(blob);
    log.info('session-key-installed', { address: keypair.address });

    dispatch({ type: 'PROCESSING', step: 'Storing session key…' });
    const payload = JSON.stringify({
      privateKey: keypair.privateKey,
      address: keypair.address,
      blob,
    });
    await cloudStorageSetItem(STORAGE_KEY, await encryptBlob(payload, privyDid));

    dispatch({ type: 'DONE', record: buildRecord() });
  }, [signerWallet, signerAddress, privyDid, buildRecord]);

  // Restore-only: decrypts and surfaces an existing stored key. Never creates.
  const unlock = React.useCallback(() => {
    if (!smartAccountAddress || !privyDid) return;
    (async () => {
      try {
        dispatch({ type: 'PROCESSING', step: 'Checking stored session key…' });
        const existing = await cloudStorageGetItem(STORAGE_KEY);
        if (!existing) return dispatch({ type: 'IDLE' });

        if (await tryRestore(existing)) {
          dispatch({ type: 'DONE', record: buildRecord() });
          return;
        }
        log.warn('auto-unlock: decryption failed — clearing stale key');
        await cloudStorageRemoveItem(STORAGE_KEY).catch(() => {});
        dispatch({ type: 'IDLE' });
      } catch (err) {
        dispatch({ type: 'IDLE' });
        log.warn('auto-unlock failed', { err: toErrorMessage(err) });
      }
    })();
  }, [smartAccountAddress, privyDid, tryRestore, buildRecord]);

  // Restore-or-create. Falls through to create() if stored blob can't be decrypted
  // (typical cause: user re-created the Privy account).
  const start = React.useCallback(() => {
    if (!smartAccountAddress || !privyDid) return;
    (async () => {
      try {
        dispatch({ type: 'PROCESSING', step: 'Checking stored session key…' });
        const existing = await cloudStorageGetItem(STORAGE_KEY);

        if (existing && (await tryRestore(existing))) {
          log.debug('choice', { choice: 'cache-hit' });
          dispatch({ type: 'DONE', record: buildRecord() });
          return;
        }
        if (existing) {
          log.warn('decryption failed — regenerating keypair');
          log.debug('choice', { choice: 'regenerate' });
        } else {
          log.debug('choice', { choice: 'install' });
        }

        await createAndStore();
      } catch (err) {
        if (isUserRejection(err)) {
          dispatch({ type: 'ERROR', message: 'You rejected the signing request — please try again.' });
          return;
        }
        log.error('start-failed', { err: toErrorMessage(err) });
        dispatch({ type: 'ERROR', message: toErrorMessage(err) });
      }
    })();
  }, [smartAccountAddress, privyDid, tryRestore, buildRecord, createAndStore]);

  const removeKey = React.useCallback(async () => {
    await cloudStorageRemoveItem(STORAGE_KEY);
    setSerializedBlob(null);
    keypairRef.current = null;
    dispatch({ type: 'ERROR', message: 'Key removed — reload to create a new one.' });
  }, []);

  return { state, start, unlock, removeKey, serializedBlob };
}

export type { DelegationRecord } from '../utils/crypto';
