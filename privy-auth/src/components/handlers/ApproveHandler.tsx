import React from 'react';
import type { ApproveRequest } from '../../types/miniAppRequest.types';
import type { DelegationState } from '../../hooks/useDelegatedKey';
import { postResponse } from '../../utils/postResponse';
import { ApprovalOnboarding } from '../ApprovalOnboarding';
import { FullScreenError, FullScreenLoading, FullScreenSuccess } from '../atomics/FullScreen';

const CLOSE_DELAY_MS = 1500;

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
  if (request.subtype === 'aegis_guard') {
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

  return (
    <SessionKeyApproval
      request={request}
      privyToken={privyToken}
      backendUrl={backendUrl}
      delegatedKeyState={delegatedKeyState}
      startDelegatedKey={startDelegatedKey}
    />
  );
}

function SessionKeyApproval({
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

  React.useEffect(() => {
    if (hasStartedRef.current) return;
    if (delegatedKeyState.status !== 'idle') return;
    hasStartedRef.current = true;
    startDelegatedKey();
  }, [delegatedKeyState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (delegatedKeyState.status !== 'done') return;
    if (hasPostedRef.current) return;
    hasPostedRef.current = true;

    const { record } = delegatedKeyState;
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
      .then(() => setTimeout(() => window.Telegram?.WebApp?.close(), CLOSE_DELAY_MS))
      .catch((err) => console.warn('[ApproveHandler] postResponse failed:', err));
  }, [delegatedKeyState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (delegatedKeyState.status === 'error') return <FullScreenError message={delegatedKeyState.message} />;
  if (delegatedKeyState.status === 'done') return <FullScreenSuccess title="Agent Connected" />;

  const step =
    delegatedKeyState.status === 'processing'
      ? delegatedKeyState.step
      : 'Installing session key…';
  return <FullScreenLoading step={step} />;
}
