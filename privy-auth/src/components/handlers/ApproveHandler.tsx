import React from 'react';
import type { ApproveRequest } from '../../types/miniAppRequest.types';
import type { DelegationState } from '../../hooks/useDelegatedKey';
import { postResponse } from '../../utils/postResponse';
import { ApprovalOnboarding } from '../ApprovalOnboarding';

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
        <div className="flex items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6">
          <div className="flex flex-col items-center gap-5 bg-[#161624] border border-white/10 rounded-2xl p-8 w-full max-w-xs shadow-[0_24px_80px_rgba(124,58,237,0.12)]">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-violet-500/20 blur-xl scale-[1.8]" />
              <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-emerald-600/10 border border-violet-500/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"
                    fill="url(#approve-ok-shield)" />
                  <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <defs>
                    <linearGradient id="approve-ok-shield" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#7c3aed" />
                      <stop offset="1" stopColor="#34d399" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-lg tracking-tight">Agent Connected</p>
              <p className="text-white/40 text-sm mt-1.5">Taking you back to Telegram…</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/20">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white/15 border-t-white/50 animate-spin" />
              Closing automatically
            </div>
          </div>
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

  // aegis_guard: render the ApprovalOnboarding flow (spending-limit grant).
  return (
    <ApprovalOnboarding
      backendJwt={privyToken}
      delegatedKey={{ state: delegatedKeyState, start: startDelegatedKey }}
      reapproval={request.reapproval === true}
      tokenAddress={request.tokenAddress}
      amountRaw={request.amountRaw}
    />
  );
}
