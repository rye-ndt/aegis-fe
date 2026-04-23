import React from 'react';
import type { ApproveRequest } from '../../types/miniAppRequest.types';
import type { DelegationState } from '../../hooks/useDelegatedKey';
import { postResponse } from '../../utils/postResponse';

export function ApproveHandler({
  request,
  privyToken,
  backendUrl,
  delegatedKeyState,
  startDelegatedKey,
}: {
  request: ApproveRequest;
  privyToken: string;
  backendUrl: string;
  delegatedKeyState: DelegationState;
  startDelegatedKey: () => void;
}) {
  const hasStartedRef = React.useRef(false);
  const hasPostedRef = React.useRef(false);

  // Auto-start session key installation — no user interaction required
  React.useEffect(() => {
    if (request.subtype !== 'session_key') return;
    if (hasStartedRef.current) return;
    if (delegatedKeyState.status !== 'idle') return;
    hasStartedRef.current = true;
    startDelegatedKey();
  }, [request.subtype, delegatedKeyState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once installed, post the delegation record and close
  React.useEffect(() => {
    if (request.subtype !== 'session_key') return;
    if (delegatedKeyState.status !== 'done') return;
    if (hasPostedRef.current) return;
    hasPostedRef.current = true;

    const record = delegatedKeyState.record;
    postResponse(backendUrl, {
      requestId: request.requestId,
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
      .then(() => setTimeout(() => window.Telegram?.WebApp?.close(), 1500))
      .catch((err) => console.warn('[ApproveHandler] postResponse failed:', err));
  }, [delegatedKeyState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (request.subtype === 'session_key') {
    if (delegatedKeyState.status === 'error') {
      return (
        <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4">
          <p className="text-sm text-red-400 text-center">{delegatedKeyState.message}</p>
        </div>
      );
    }

    if (delegatedKeyState.status === 'done') {
      return (
        <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4">
          <div className="text-5xl">✅</div>
          <p className="text-white font-semibold">Session key ready</p>
          <p className="text-sm text-white/40">Returning to Telegram…</p>
        </div>
      );
    }

    const step =
      delegatedKeyState.status === 'processing'
        ? delegatedKeyState.step
        : 'Installing session key…';

    return (
      <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
        <p className="text-sm text-white/40">{step}</p>
      </div>
    );
  }

  // aegis_guard: not yet implemented
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4">
      <p className="text-sm text-white/40 text-center">AegisGuard setup is not yet available.</p>
      <button
        onClick={() => {
          postResponse(backendUrl, {
            requestId: request.requestId,
            requestType: 'approve',
            privyToken,
            subtype: 'aegis_guard',
            rejected: true,
          }).catch(() => {});
          window.Telegram?.WebApp?.close();
        }}
        className="text-xs text-red-400 underline underline-offset-2"
      >
        Cancel
      </button>
    </div>
  );
}
