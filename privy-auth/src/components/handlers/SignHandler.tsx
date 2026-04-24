import React from 'react';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import type { SignRequest } from '../../types/miniAppRequest.types';
import { postResponse } from '../../utils/postResponse';
import { createSessionKeyClient } from '../../utils/crypto';
import { fetchNextRequest } from '../../utils/fetchNextRequest';
import { SigningRequestModal } from '../SigningRequestModal';
import { FullScreen } from '../atomics/FullScreen';
import { Spinner } from '../atomics/spinner';
import { ShieldIcon } from '../atomics/icons';
import type { DelegationState } from '../../hooks/useDelegatedKey';
import { createLogger } from '../../utils/logger';

const log = createLogger('SignHandler');

const ZERODEV_RPC = (import.meta.env.VITE_ZERODEV_RPC as string) ?? '';
const PAYMASTER_URL = (import.meta.env.VITE_PAYMASTER_URL as string) ?? '';
// Fallback timeout only starts once the delegated key is no longer being restored.
// While unlock() is in-flight we wait indefinitely — the timer is for the case
// where the blob is genuinely unavailable (no stored key, decrypt failed, etc.).
const AUTO_SIGN_TIMEOUT_MS = 10_000;
const CLOSE_DELAY_MS = 1500;

type SessionClient = Awaited<ReturnType<typeof createSessionKeyClient>>;

export function SignHandler({
  request: initialRequest,
  privyToken,
  backendUrl,
  serializedBlob,
  keyStatus,
}: {
  request: SignRequest;
  privyToken: string;
  backendUrl: string;
  serializedBlob: string | null;
  keyStatus: DelegationState['status'];
}) {
  const { client } = useSmartWallets();
  const [currentRequest, setCurrentRequest] = React.useState<SignRequest>(initialRequest);
  const [showManual, setShowManual] = React.useState(!initialRequest.autoSign);
  const [done, setDone] = React.useState(false);
  const [autoSignError, setAutoSignError] = React.useState<string | null>(null);
  const autoSignAttemptedRef = React.useRef(false);
  // Cache the session client across swap steps to avoid re-paying init cost.
  const sessionClientRef = React.useRef<SessionClient | null>(null);

  // Resync when the parent swaps in a different request (distinct requestId).
  // useState initializer only fires once, so without this the first request
  // would persist even if the dispatcher routed a new one to us.
  React.useEffect(() => {
    if (initialRequest.requestId !== currentRequest.requestId) {
      setCurrentRequest(initialRequest);
      setShowManual(!initialRequest.autoSign);
      setAutoSignError(null);
      autoSignAttemptedRef.current = false;
    }
  }, [initialRequest, currentRequest.requestId]);

  const sendReject = React.useCallback(() => {
    postResponse(backendUrl, {
      requestId: currentRequest.requestId,
      requestType: 'sign',
      privyToken,
      rejected: true,
    }).catch(() => {});
  }, [currentRequest, privyToken, backendUrl]);

  const reportTxHash = React.useCallback(
    (txHash: string) =>
      postResponse(backendUrl, {
        requestId: currentRequest.requestId,
        requestType: 'sign',
        privyToken,
        txHash,
      }),
    [currentRequest, privyToken, backendUrl],
  );

  // Auto-sign: fire once per currentRequest; re-runs when currentRequest changes
  // (i.e. when next swap step arrives). Falls back to manual after timeout.
  React.useEffect(() => {
    if (!currentRequest.autoSign || autoSignAttemptedRef.current) return;

    if (!serializedBlob) {
      // Don't race the unlock: while the key is still being restored, just wait.
      // Only arm the fallback once the key machine has settled without a blob
      // (idle = no stored key / error = decrypt failed / done-without-blob = unexpected).
      if (keyStatus === 'processing') return;
      const timer = setTimeout(() => {
        if (autoSignAttemptedRef.current) return;
        log.warn('serializedBlob timed out — falling back to manual', { keyStatus });
        setShowManual(true);
      }, AUTO_SIGN_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }

    autoSignAttemptedRef.current = true;
    log.info('step', { step: 'started', requestId: currentRequest.requestId });
    log.debug('autoSign start', {
      requestId: currentRequest.requestId,
      blobLen: serializedBlob.length,
      hasRpc: !!ZERODEV_RPC,
      hasPaymaster: !!PAYMASTER_URL,
      to: currentRequest.to,
      value: currentRequest.value,
      dataLen: currentRequest.data.length,
    });

    (async () => {
      let sessionClient = sessionClientRef.current;
      if (!sessionClient) {
        try {
          sessionClient = await createSessionKeyClient(
            serializedBlob,
            ZERODEV_RPC,
            PAYMASTER_URL || undefined,
          );
          sessionClientRef.current = sessionClient;
          log.debug('session client built', { account: sessionClient.account?.address });
        } catch (err) {
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          log.error('createSessionKeyClient failed', { requestId: currentRequest.requestId, err: msg });
          if (err instanceof Error && err.stack) log.debug('stack', { stack: err.stack });
          setAutoSignError(`createSessionKeyClient: ${msg}`);
          return;
        }
      }

      try {
        const hash = await sessionClient.sendTransaction({
          to: currentRequest.to as `0x${string}`,
          value: BigInt(currentRequest.value),
          data: currentRequest.data as `0x${string}`,
          account: sessionClient.account!,
          chain: null,
        });
        log.info('step', { step: 'submitted', requestId: currentRequest.requestId, hash });
        await reportTxHash(hash);

        // Before closing, check if the backend has queued a next step.
        let nextRequest: Awaited<ReturnType<typeof fetchNextRequest>> = null;
        try {
          nextRequest = await fetchNextRequest(backendUrl, currentRequest.requestId, privyToken);
        } catch (err) {
          log.warn('fetchNextRequest failed', { requestId: currentRequest.requestId, err: String(err) });
        }

        if (nextRequest && nextRequest.requestType === 'sign') {
          log.info('next swap step found', { requestId: nextRequest.requestId });
          autoSignAttemptedRef.current = false;
          setCurrentRequest(nextRequest as SignRequest);
        } else {
          log.info('step', { step: 'succeeded', requestId: currentRequest.requestId });
          setDone(true);
          setTimeout(() => window.Telegram?.WebApp?.close(), CLOSE_DELAY_MS);
        }
      } catch (err) {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        log.error('sendTransaction failed', { requestId: currentRequest.requestId, err: msg });
        if (err instanceof Error && err.stack) log.debug('stack', { stack: err.stack });
        setAutoSignError(`sendTransaction: ${msg}`);
      }
    })();
  }, [currentRequest, serializedBlob, keyStatus, reportTxHash, backendUrl, privyToken]);

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

  // Auto-sign failures are shown as a persistent, readable screen instead of
  // the manual modal. Manual sign for an autoSign request is not a valid
  // recovery (same account, usually the same class of failure like AA21), and
  // swapping the view to a modal hides the error text behind TG UI chrome.
  if (autoSignError && currentRequest.autoSign) {
    const copy = () => {
      navigator.clipboard?.writeText(autoSignError).catch(() => {});
    };
    return (
      <FullScreen>
        <div className="flex flex-col gap-4 max-w-md w-full">
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">⚠️</div>
            <p className="text-white font-semibold text-lg">Auto-sign failed</p>
            <p className="text-xs text-white/50 text-center">
              The delegated key could not execute this transaction.
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-left">
            <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1">
              Error
            </p>
            <p className="text-xs text-red-200 break-all whitespace-pre-wrap select-text max-h-64 overflow-auto">
              {autoSignError}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-left text-xs text-white/60 space-y-1">
            <div>bundler: {ZERODEV_RPC ? 'set' : 'MISSING'}</div>
            <div>paymaster: {PAYMASTER_URL ? 'set' : 'MISSING'}</div>
            <div>to: <span className="break-all">{currentRequest.to}</span></div>
            <div>value: {currentRequest.value}</div>
            <div>dataLen: {currentRequest.data.length}</div>
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 text-xs py-2 rounded border border-white/20 text-white/80 active:bg-white/10"
              onClick={copy}
            >
              Copy error
            </button>
            <button
              className="flex-1 text-xs py-2 rounded border border-white/20 text-white/80 active:bg-white/10"
              onClick={() => {
                sendReject();
                window.Telegram?.WebApp?.close();
              }}
            >
              Close
            </button>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (!showManual) {
    const waiting = !serializedBlob;
    return (
      <FullScreen>
        <div className="flex flex-col items-center gap-5 max-w-sm text-center">
          <ShieldIcon size={64} variant="violet" />
          <div className="flex flex-col gap-1.5">
            <p className="text-white font-semibold text-lg">
              {waiting ? 'Preparing your session key' : 'Signing with your delegated key'}
            </p>
            <p className="text-sm text-white/60 leading-relaxed">
              {waiting
                ? 'Unlocking your on-device session key. No popup — this happens silently.'
                : 'Your delegated key is signing this transaction automatically. You will not need to approve anything.'}
            </p>
          </div>
          <div className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-left">
            <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1">
              Action
            </p>
            <p className="text-sm text-white/80 break-words">{currentRequest.description}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Spinner size="xs" />
            <span>{waiting ? 'Loading key…' : 'Broadcasting transaction…'}</span>
          </div>
        </div>
      </FullScreen>
    );
  }

  return (
    <>
      {autoSignError && (
        <div className="fixed top-2 left-2 right-2 z-50 bg-red-500/10 border border-red-500/30 text-red-200 text-xs p-2 rounded">
          Auto-sign failed — please approve manually. ({autoSignError})
        </div>
      )}
    <SigningRequestModal
      event={{
        type: 'sign_request',
        requestId: currentRequest.requestId,
        to: currentRequest.to,
        value: currentRequest.value,
        data: currentRequest.data,
        description: currentRequest.description,
        expiresAt: currentRequest.expiresAt,
        autoSign: currentRequest.autoSign,
      }}
      approve={async () => {
        if (!client) throw new Error('Smart wallet not ready');
        log.info('step', { step: 'started', requestId: currentRequest.requestId, path: 'manual' });
        const hash = await client.sendTransaction({
          to: currentRequest.to as `0x${string}`,
          value: BigInt(currentRequest.value),
          data: currentRequest.data as `0x${string}`,
          account: client.account!,
          chain: null,
        });
        log.info('step', { step: 'succeeded', requestId: currentRequest.requestId, hash, path: 'manual' });
        await reportTxHash(hash);
        setTimeout(() => window.Telegram?.WebApp?.close(), CLOSE_DELAY_MS);
      }}
      reject={() => {
        sendReject();
        setTimeout(() => window.Telegram?.WebApp?.close(), CLOSE_DELAY_MS);
      }}
    />
    </>
  );
}
