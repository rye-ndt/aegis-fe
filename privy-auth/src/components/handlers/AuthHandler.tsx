import React from 'react';
import type { AuthRequest } from '../../types/miniAppRequest.types';
import type { DelegationState } from '../../hooks/useDelegatedKey';
import { postResponse } from '../../utils/postResponse';

export function AuthHandler({
  request,
  privyToken,
  backendUrl,
  delegatedKeyState,
  startDelegatedKey,
}: {
  request: AuthRequest;
  privyToken: string;
  backendUrl: string;
  delegatedKeyState: DelegationState;
  startDelegatedKey: () => void;
}) {
  const [authDone, setAuthDone] = React.useState(false);
  const [approveRequestId, setApproveRequestId] = React.useState<string | null>(null);
  const [allDone, setAllDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const authPostedRef = React.useRef(false);
  const keyStartedRef = React.useRef(false);
  const approvePostedRef = React.useRef(false);

  // Step 1: post auth response, get back approveRequestId if session key needed
  React.useEffect(() => {
    if (authPostedRef.current) return;
    authPostedRef.current = true;

    const telegramChatId =
      window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() ?? request.telegramChatId;

    postResponse(backendUrl, {
      requestId: request.requestId,
      requestType: 'auth',
      privyToken,
      telegramChatId,
    })
      .then((body) => {
        setAuthDone(true);
        const b = body as { approveRequestId?: string } | null;
        if (b?.approveRequestId) {
          setApproveRequestId(b.approveRequestId);
        } else {
          setAllDone(true);
          setTimeout(() => window.Telegram?.WebApp?.close(), 1500);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: start session key creation once idle
  React.useEffect(() => {
    if (!approveRequestId) return;
    if (keyStartedRef.current) return;
    if (delegatedKeyState.status !== 'idle') return;
    keyStartedRef.current = true;
    startDelegatedKey();
  }, [approveRequestId, delegatedKeyState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 3: once key is installed, post the approve response
  React.useEffect(() => {
    if (!approveRequestId) return;
    if (delegatedKeyState.status !== 'done') return;
    if (approvePostedRef.current) return;
    approvePostedRef.current = true;

    const record = delegatedKeyState.record;
    postResponse(backendUrl, {
      requestId: approveRequestId,
      requestType: 'approve',
      privyToken,
      subtype: 'session_key',
      delegationRecord: {
        publicKey: record.publicKey,
        address: record.address,
        smartAccountAddress: record.smartAccountAddress,
        signerAddress: record.signerAddress,
        permissions: record.permissions,
        grantedAt: record.grantedAt,
      },
    })
      .then(() => {
        setAllDone(true);
        setTimeout(() => window.Telegram?.WebApp?.close(), 1500);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [approveRequestId, delegatedKeyState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4">
        <p className="text-sm text-red-400 text-center">{error}</p>
      </div>
    );
  }

  if (allDone) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4">
        <div className="text-5xl">✅</div>
        <p className="text-white font-semibold">{approveRequestId ? 'All set' : 'Signed in'}</p>
        <p className="text-sm text-white/40">Returning to Telegram…</p>
      </div>
    );
  }

  const step =
    delegatedKeyState.status === 'processing'
      ? delegatedKeyState.step
      : authDone && approveRequestId
        ? 'Installing session key…'
        : null;

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4">
      <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
      {step && <p className="text-sm text-white/40">{step}</p>}
    </div>
  );
}
