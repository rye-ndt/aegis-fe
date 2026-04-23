import React from 'react';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import type { SignRequest } from '../../types/miniAppRequest.types';
import { postResponse } from '../../utils/postResponse';
import { createSessionKeyClient } from '../../utils/crypto';
import { SigningRequestModal } from '../SigningRequestModal';

const ZERODEV_RPC = (import.meta.env.VITE_ZERODEV_RPC as string) ?? '';
const PAYMASTER_URL = (import.meta.env.VITE_PAYMASTER_URL as string) ?? '';

export function SignHandler({
  request,
  privyToken,
  backendUrl,
  serializedBlob,
}: {
  request: SignRequest;
  privyToken: string;
  backendUrl: string;
  serializedBlob: string | null;
}) {
  const { client } = useSmartWallets();
  const [showManual, setShowManual] = React.useState(!request.autoSign);
  const [done, setDone] = React.useState(false);
  const autoSignAttemptedRef = React.useRef(false);

  const doAutoSign = React.useCallback(async (blob: string) => {
    try {
      const sessionClient = await createSessionKeyClient(blob, ZERODEV_RPC, PAYMASTER_URL || undefined);
      const hash = await sessionClient.sendTransaction({
        to: request.to as `0x${string}`,
        value: BigInt(request.value),
        data: request.data as `0x${string}`,
        account: sessionClient.account!,
        chain: null,
      });
      await postResponse(backendUrl, {
        requestId: request.requestId,
        requestType: 'sign',
        privyToken,
        txHash: hash,
      });
      setDone(true);
      window.Telegram?.WebApp?.close();
    } catch (err) {
      console.warn('[SignHandler] autoSign failed:', err instanceof Error ? err.message : String(err));
      postResponse(backendUrl, {
        requestId: request.requestId,
        requestType: 'sign',
        privyToken,
        rejected: true,
      }).catch(() => {});
      setShowManual(true);
    }
  }, [request, privyToken, backendUrl]);

  // Auto-sign path: fire when blob arrives, with 10 s fallback to manual
  React.useEffect(() => {
    if (!request.autoSign) return;

    if (serializedBlob && !autoSignAttemptedRef.current) {
      autoSignAttemptedRef.current = true;
      doAutoSign(serializedBlob);
      return;
    }

    if (serializedBlob) return; // already handled above

    // Blob not yet loaded — start safety timer
    const timer = setTimeout(() => {
      if (!autoSignAttemptedRef.current) {
        console.warn('[SignHandler] serializedBlob timed out — falling back to manual');
        setShowManual(true);
      }
    }, 10_000);

    return () => clearTimeout(timer);
  }, [serializedBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl">✅</div>
          <p className="text-white font-semibold">Transaction sent</p>
        </div>
      </div>
    );
  }

  if (!showManual) {
    return (
      <div className="flex items-center justify-center w-full min-h-dvh bg-[#0f0f1a]">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
      </div>
    );
  }

  const pendingRequest = {
    event: {
      type: 'sign_request' as const,
      requestId: request.requestId,
      to: request.to,
      value: request.value,
      data: request.data,
      description: request.description,
      expiresAt: request.expiresAt,
      autoSign: request.autoSign,
    },
    approve: async () => {
      if (!client) throw new Error('Smart wallet not ready');
      const hash = await client.sendTransaction({
        to: request.to as `0x${string}`,
        value: BigInt(request.value),
        data: request.data as `0x${string}`,
        account: client.account!,
        chain: null,
      });
      await postResponse(backendUrl, {
        requestId: request.requestId,
        requestType: 'sign',
        privyToken,
        txHash: hash,
      });
      window.Telegram?.WebApp?.close();
    },
    reject: () => {
      postResponse(backendUrl, {
        requestId: request.requestId,
        requestType: 'sign',
        privyToken,
        rejected: true,
      }).catch(() => {});
      window.Telegram?.WebApp?.close();
    },
  };

  return (
    <SigningRequestModal
      request={pendingRequest}
      onClose={() => { /* modal's approve/reject already handle close */ }}
    />
  );
}
