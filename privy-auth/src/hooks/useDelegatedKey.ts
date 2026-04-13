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
import { createInterceptingProvider, type PendingSigningRequest } from '../utils/signingInterceptor';

const STORAGE_KEY = 'delegated_key';

const DEFAULT_PERMISSIONS: Permission[] = [{
  tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  maxAmount: '1000000000000000000',
  validUntil: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
}];

export type DelegationState =
  | { status: 'idle' }
  | { status: 'needs_password'; mode: 'create' | 'unlock'; error?: string }
  | { status: 'processing'; step: string }
  | { status: 'done'; record: DelegationRecord }
  | { status: 'error'; message: string };

type Action =
  | { type: 'NEEDS_CREATE'; error?: string }
  | { type: 'NEEDS_UNLOCK'; error?: string }
  | { type: 'PROCESSING'; step: string }
  | { type: 'DONE'; record: DelegationRecord }
  | { type: 'ERROR'; message: string };

function reducer(_: DelegationState, action: Action): DelegationState {
  switch (action.type) {
    case 'NEEDS_CREATE': return { status: 'needs_password', mode: 'create', error: action.error };
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
  onPendingSigning: (req: PendingSigningRequest) => void;
}): {
  state: DelegationState;
  submitPassword: (password: string) => void;
} {
  const { smartAccountAddress, signerAddress, signerWallet, onPendingSigning } = options;
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

  // Stable ref so onPendingSigning changes don't recreate submitPassword
  const onPendingSigningRef = React.useRef(onPendingSigning);
  React.useEffect(() => { onPendingSigningRef.current = onPendingSigning; }, [onPendingSigning]);

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
          // TODO (future): GET ${VITE_BACKEND_URL}/permissions?address=<session_key_address>
          // to repopulate the full public record for the debug panel.
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
        console.log('[Delegation] Generated keypair:', {
          address: keypair.address,
          publicKey: keypair.publicKey,
          privateKey: keypair.privateKey, // WARNING: remove before production
        });

        if (!signerWallet) throw new Error('Privy embedded wallet not found');
        const rawProvider = await signerWallet.getEthereumProvider();
        const provider = createInterceptingProvider(
          rawProvider as Parameters<typeof createInterceptingProvider>[0],
          (req) => onPendingSigningRef.current(req),
        );

        dispatch({ type: 'PROCESSING', step: 'Installing session key on-chain… (approve in wallet)' });
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
        // User rejected the signing request — return to password prompt with a helpful message
        const isUserRejection =
          (err as { code?: number })?.code === 4001 ||
          (err instanceof Error && err.message.includes('User rejected'));
        if (isUserRejection) {
          // Determine mode: if no encrypted blob existed we were in CREATE flow
          const mode = encryptedBlobRef.current ? 'NEEDS_UNLOCK' : 'NEEDS_CREATE';
          dispatch({
            type: mode,
            error: 'You rejected the signing request — try again.',
          });
          return;
        }
        dispatch({ type: 'ERROR', message: toErrorMessage(err) });
      }
    },
    [smartAccountAddress, signerAddress, signerWallet],
  );

  return { state, submitPassword };
}

export type { DelegationRecord } from '../utils/crypto';
