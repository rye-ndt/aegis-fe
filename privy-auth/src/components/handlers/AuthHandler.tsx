import React from 'react';
import type { AuthRequest } from '../../types/miniAppRequest.types';
import type { DelegationState } from '../../hooks/useDelegatedKey';
import { postResponse } from '../../utils/postResponse';
import { toErrorMessage } from '../../utils/toErrorMessage';
import { FullScreenError, FullScreenLoading, FullScreenSuccess } from '../atomics/FullScreen';

const CLOSE_DELAY_MS = 1500;

function closeTma() {
  setTimeout(() => window.Telegram?.WebApp?.close(), CLOSE_DELAY_MS);
}

type Phase =
  | { kind: 'posting_auth' }
  | { kind: 'installing_key'; approveRequestId: string }
  | { kind: 'done'; needsApprove: boolean }
  | { kind: 'error'; message: string };

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
  const [phase, setPhase] = React.useState<Phase>({ kind: 'posting_auth' });
  const authPostedRef = React.useRef(false);
  const approvePostedRef = React.useRef(false);

  // Step 1: post the auth response. Backend may return an approveRequestId for session-key install.
  // Ref-guarded against StrictMode dev double-fires (effect has [] deps).
  React.useEffect(() => {
    if (authPostedRef.current) return;
    authPostedRef.current = true;

    const telegramChatId =
      window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() ??
      request.telegramChatId;

    postResponse(backendUrl, {
      requestId: request.requestId,
      requestType: 'auth',
      privyToken,
      telegramChatId,
    })
      .then((body) => {
        const approveRequestId = (body as { approveRequestId?: string } | null)?.approveRequestId;
        if (approveRequestId) {
          setPhase({ kind: 'installing_key', approveRequestId });
        } else {
          setPhase({ kind: 'done', needsApprove: false });
          closeTma();
        }
      })
      .catch((err: unknown) => setPhase({ kind: 'error', message: toErrorMessage(err) }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: once we know approval is needed, kick off key install when idle.
  React.useEffect(() => {
    if (phase.kind !== 'installing_key') return;
    if (delegatedKeyState.status !== 'idle') return;
    startDelegatedKey();
  }, [phase.kind, delegatedKeyState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 3: key installed → post the approve response, then close.
  React.useEffect(() => {
    if (phase.kind !== 'installing_key') return;
    if (delegatedKeyState.status !== 'done') return;
    if (approvePostedRef.current) return;
    approvePostedRef.current = true;

    const { record } = delegatedKeyState;
    postResponse(backendUrl, {
      requestId: phase.approveRequestId,
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
        setPhase({ kind: 'done', needsApprove: true });
        closeTma();
      })
      .catch((err: unknown) => setPhase({ kind: 'error', message: toErrorMessage(err) }));
  }, [phase, delegatedKeyState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase.kind === 'error') return <FullScreenError message={phase.message} />;

  if (phase.kind === 'done') {
    return <FullScreenSuccess title={phase.needsApprove ? 'All Set' : 'Connected to Aegis'} />;
  }

  const step =
    delegatedKeyState.status === 'processing'
      ? delegatedKeyState.step
      : phase.kind === 'installing_key'
        ? 'Installing session key…'
        : null;

  return <FullScreenLoading step={step} />;
}
