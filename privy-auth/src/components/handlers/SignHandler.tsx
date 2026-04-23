import React from 'react';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import type { SignRequest } from '../../types/miniAppRequest.types';
import { postResponse } from '../../utils/postResponse';
import { createSessionKeyClient } from '../../utils/crypto';
import { SigningRequestModal } from '../SigningRequestModal';
import { FullScreen } from '../atomics/FullScreen';
import { Spinner } from '../atomics/spinner';

const ZERODEV_RPC = (import.meta.env.VITE_ZERODEV_RPC as string) ?? '';
const PAYMASTER_URL = (import.meta.env.VITE_PAYMASTER_URL as string) ?? '';
const AUTO_SIGN_TIMEOUT_MS = 10_000;

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

  const sendReject = React.useCallback(() => {
    postResponse(backendUrl, {
      requestId: request.requestId,
      requestType: 'sign',
      privyToken,
      rejected: true,
    }).catch(() => {});
  }, [request, privyToken, backendUrl]);

  const reportTxHash = React.useCallback(
    (txHash: string) =>
      postResponse(backendUrl, {
        requestId: request.requestId,
        requestType: 'sign',
        privyToken,
        txHash,
      }),
    [request, privyToken, backendUrl],
  );

  // Auto-sign: fire once when the blob arrives; fall back to manual after a timeout.
  React.useEffect(() => {
    if (!request.autoSign || autoSignAttemptedRef.current) return;

    if (!serializedBlob) {
      const timer = setTimeout(() => {
        if (autoSignAttemptedRef.current) return;
        console.warn('[SignHandler] serializedBlob timed out — falling back to manual');
        setShowManual(true);
      }, AUTO_SIGN_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }

    autoSignAttemptedRef.current = true;
    (async () => {
      try {
        const sessionClient = await createSessionKeyClient(
          serializedBlob,
          ZERODEV_RPC,
          PAYMASTER_URL || undefined,
        );
        const hash = await sessionClient.sendTransaction({
          to: request.to as `0x${string}`,
          value: BigInt(request.value),
          data: request.data as `0x${string}`,
          account: sessionClient.account!,
          chain: null,
        });
        await reportTxHash(hash);
        setDone(true);
        window.Telegram?.WebApp?.close();
      } catch (err) {
        console.warn('[SignHandler] autoSign failed:', err instanceof Error ? err.message : String(err));
        sendReject();
        setShowManual(true);
      }
    })();
  }, [request, serializedBlob, reportTxHash, sendReject]);

  if (done) {
    return (
      <FullScreen>
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl">✅</div>
          <p className="text-white font-semibold">Transaction sent</p>
        </div>
      </FullScreen>
    );
  }

  if (!showManual) {
    return (
      <FullScreen>
        <Spinner size="lg" />
      </FullScreen>
    );
  }

  return (
    <SigningRequestModal
      event={{
        type: 'sign_request',
        requestId: request.requestId,
        to: request.to,
        value: request.value,
        data: request.data,
        description: request.description,
        expiresAt: request.expiresAt,
        autoSign: request.autoSign,
      }}
      approve={async () => {
        if (!client) throw new Error('Smart wallet not ready');
        const hash = await client.sendTransaction({
          to: request.to as `0x${string}`,
          value: BigInt(request.value),
          data: request.data as `0x${string}`,
          account: client.account!,
          chain: null,
        });
        await reportTxHash(hash);
        window.Telegram?.WebApp?.close();
      }}
      reject={() => {
        sendReject();
        window.Telegram?.WebApp?.close();
      }}
    />
  );
}
