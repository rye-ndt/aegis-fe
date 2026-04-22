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
import { cloudStorageGetItem, cloudStorageSetItem, cloudStorageRemoveItem } from '../utils/telegramStorage';
import { toErrorMessage } from '../utils/toErrorMessage';

const STORAGE_KEY = 'delegated_key';

const DEFAULT_PERMISSIONS: Permission[] = [{
  tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  maxAmount: '1000000000000000000',
  validUntil: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
}];

export type DelegationState =
  | { status: 'idle' }
  | { status: 'processing'; step: string }
  | { status: 'done'; record: DelegationRecord }
  | { status: 'error'; message: string };

type Action =
  | { type: 'PROCESSING'; step: string }
  | { type: 'DONE'; record: DelegationRecord }
  | { type: 'ERROR'; message: string };

function reducer(_: DelegationState, action: Action): DelegationState {
  switch (action.type) {
    case 'PROCESSING': return { status: 'processing', step: action.step };
    case 'DONE': return { status: 'done', record: action.record };
    case 'ERROR': return { status: 'error', message: action.message };
  }
}

export function useDelegatedKey(options: {
  smartAccountAddress: string;
  signerAddress: string;
  signerWallet: ConnectedWallet | undefined;
  privyDid: string;                          // used for deterministic key derivation — no user prompt
  backendJwt?: string | null;
}): {
  state: DelegationState;
  start: () => void;
  removeKey: () => Promise<void>;
  serializedBlob: string | null;
  keypairRef: React.MutableRefObject<{ privateKey: `0x${string}`; address: `0x${string}` } | null>;
  keypairAddress: string | null;
  scaAddress: string;
  updateBlob: (newBlob: string) => Promise<void>;
} {
  const { smartAccountAddress, signerAddress, signerWallet, privyDid, backendJwt } = options;
  const [state, dispatch] = React.useReducer(reducer, { status: 'idle' });

  // Holds the decrypted serialized blob after unlock/create; exposed for SSE signing
  const serializedBlobRef = React.useRef<string | null>(null);
  // Holds the keypair
  const keypairRef = React.useRef<{ privateKey: `0x${string}`; address: `0x${string}` } | null>(null);

  const start = React.useCallback(() => {
    if (!smartAccountAddress || !privyDid) return;

    (async () => {
      try {
        dispatch({ type: 'PROCESSING', step: 'Checking stored session key…' });

        const existing = await cloudStorageGetItem(STORAGE_KEY);

        if (existing) {
          // ── UNLOCK: decrypt the stored blob and restore keypair ─────────────
          dispatch({ type: 'PROCESSING', step: 'Decrypting session key…' });
          let decrypted: string;
          try {
            decrypted = await decryptBlob(existing, privyDid);
          } catch {
            // Wrong key (user re-created account?) — fall through to CREATE path
            console.warn('[Delegation] Decryption failed with privyDid — regenerating keypair');
            // Intentional fall-through: decrypted is not set, CREATE block below will handle it
            await createAndStore();
            return;
          }

          try {
            const wrapper = JSON.parse(decrypted);
            if (wrapper.blob && wrapper.privateKey && wrapper.address) {
              keypairRef.current = { privateKey: wrapper.privateKey as Hex, address: wrapper.address as Hex };
              serializedBlobRef.current = wrapper.blob;
            } else if (wrapper.privateKey) {
              keypairRef.current = { privateKey: wrapper.privateKey as Hex, address: (wrapper.address ?? '0x') as Hex };
              serializedBlobRef.current = decrypted;
            } else {
              serializedBlobRef.current = decrypted;
            }
          } catch {
            // Legacy raw blob without keypair metadata
            serializedBlobRef.current = decrypted;
          }

          const record: DelegationRecord = {
            publicKey: keypairRef.current?.address ?? '',
            address: (keypairRef.current?.address ?? '0x') as `0x${string}`,
            smartAccountAddress: smartAccountAddress as `0x${string}`,
            signerAddress: signerAddress as `0x${string}`,
            permissions: DEFAULT_PERMISSIONS,
            grantedAt: 0,
          };
          dispatch({ type: 'DONE', record });
          return;
        }

        // ── CREATE: generate keypair → install on-chain → encrypt → store ────
        await createAndStore();
      } catch (err) {
        dispatch({ type: 'ERROR', message: toErrorMessage(err) });
      }
    })();

    async function createAndStore() {
      try {
        dispatch({ type: 'PROCESSING', step: 'Generating session keypair…' });
        const keypair = generateKeypair();
        keypairRef.current = { privateKey: keypair.privateKey, address: keypair.address };
        console.log('[Delegation] Generated keypair:', {
          address: keypair.address,
          publicKey: keypair.publicKey,
        });

        if (!signerWallet) throw new Error('Privy embedded wallet not found');
        const rawProvider = await signerWallet.getEthereumProvider();

        const zerodevRpc = (import.meta.env.VITE_ZERODEV_RPC as string) ?? '';
        if (!zerodevRpc) throw new Error('VITE_ZERODEV_RPC is not set');

        dispatch({ type: 'PROCESSING', step: 'Installing session key on-chain…' });
        const blob = await installSessionKey(
          rawProvider as Parameters<typeof installSessionKey>[0],
          signerAddress as `0x${string}`,
          keypair.privateKey,
          keypair.address,
          zerodevRpc,
        );
        serializedBlobRef.current = blob;

        dispatch({ type: 'PROCESSING', step: 'Storing session key…' });
        const payload = JSON.stringify({ privateKey: keypair.privateKey, address: keypair.address, blob });
        const encrypted = await encryptBlob(payload, privyDid);
        await cloudStorageSetItem(STORAGE_KEY, encrypted);

        // POST public record to backend (no private key included)
        dispatch({ type: 'PROCESSING', step: 'Persisting public metadata to backend…' });
        const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';
        const record: DelegationRecord = {
          publicKey: keypair.publicKey,
          address: keypair.address,
          smartAccountAddress: smartAccountAddress as `0x${string}`,
          signerAddress: signerAddress as `0x${string}`,
          permissions: DEFAULT_PERMISSIONS,
          grantedAt: Math.floor(Date.now() / 1000),
        };
        try {
          const resp = await fetch(`${backendUrl}/persistent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(backendJwt ? { Authorization: `Bearer ${backendJwt}` } : {}),
            },
            body: JSON.stringify(record),
          });
          if (!resp.ok) console.warn('[Delegation] Backend /persistent returned', resp.status);
        } catch (fetchErr) {
          console.warn('[Delegation] Could not reach backend /persistent:', toErrorMessage(fetchErr));
        }

        console.log('[Delegation] Session key installed. Keypair:', { address: record.address, publicKey: record.publicKey });
        dispatch({ type: 'DONE', record });
      } catch (err) {
        const isUserRejection =
          (err as { code?: number })?.code === 4001 ||
          (err instanceof Error && err.message.includes('User rejected'));
        if (isUserRejection) {
          dispatch({ type: 'ERROR', message: 'You rejected the signing request — please try again.' });
          return;
        }
        dispatch({ type: 'ERROR', message: toErrorMessage(err) });
      }
    }
  }, [smartAccountAddress, signerAddress, signerWallet, privyDid]);

  const removeKey = React.useCallback(async () => {
    await cloudStorageRemoveItem(STORAGE_KEY);
    serializedBlobRef.current = null;
    keypairRef.current = null;
    dispatch({ type: 'ERROR', message: 'Key removed — reload to create a new one.' });
  }, []);

  const updateBlob = React.useCallback(async (newBlob: string) => {
    if (!privyDid) throw new Error('privyDid not available to encrypt blob');
    const storagePayload = JSON.stringify({
      privateKey: keypairRef.current?.privateKey,
      address: keypairRef.current?.address,
      blob: newBlob,
    });
    const encrypted = await encryptBlob(storagePayload, privyDid);
    await cloudStorageSetItem(STORAGE_KEY, encrypted);
    serializedBlobRef.current = newBlob;
  }, [privyDid]);

  return {
    state,
    start,
    removeKey,
    serializedBlob: serializedBlobRef.current,
    keypairRef,
    keypairAddress: keypairRef.current?.address || null,
    scaAddress: smartAccountAddress,
    updateBlob,
  };
}

export type { DelegationRecord } from '../utils/crypto';
