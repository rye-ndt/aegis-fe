import React from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { useDelegatedKey } from './hooks/useDelegatedKey';
import { useRequest } from './hooks/useRequest';
import { AuthHandler } from './components/handlers/AuthHandler';
import { SignHandler } from './components/handlers/SignHandler';
import { YieldDepositHandler } from './components/handlers/YieldDepositHandler';
import { ApproveHandler } from './components/handlers/ApproveHandler';
import { OnrampHandler } from './components/handlers/OnrampHandler';
import { StatusView } from './components/StatusView';
import { usePrivyToken } from './hooks/privy';
import { LoadingSpinner } from './components/atomics/spinner';
import { FullScreenError } from './components/atomics/FullScreen';
import { LoginView } from './components/views/login';

const TMA_AUTO_LOGIN_TIMEOUT_MS = 4000;

function isInsideTelegram() {
  return !!window.Telegram?.WebApp?.initData;
}

export default function App() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { client } = useSmartWallets();
  const privyToken = usePrivyToken();
  const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';
  const [tmaLoginTimedOut, setTmaLoginTimedOut] = React.useState(false);

  // Give TelegramAutoLogin a window to succeed before falling back to LoginView.
  React.useEffect(() => {
    if (!isInsideTelegram()) return;
    const t = setTimeout(() => setTmaLoginTimedOut(true), TMA_AUTO_LOGIN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const eoaAddress = (embeddedWallet ?? wallets[0])?.address ?? '';
  const smartAddress = client?.account?.address ?? '';

  const delegatedKey = useDelegatedKey({
    smartAccountAddress: smartAddress,
    signerAddress: eoaAddress,
    signerWallet: embeddedWallet,
    privyDid: user?.id ?? '',
  });

  const { requestId, request, loading: requestLoading, error: requestError } = useRequest(backendUrl);

  // Auto-unlock or auto-create the session keypair once logged in.
  // - Inside Telegram with no requestId → start() (create if missing).
  // - Anywhere else → unlock() (restore-only, no popup).
  // Skipped for auth requests: AuthHandler calls start() itself.
  const autoKeyStartedRef = React.useRef(false);
  const isAuthRequest = request?.requestType === 'auth';
  React.useEffect(() => {
    if (autoKeyStartedRef.current) return;
    if (!authenticated || !smartAddress || !eoaAddress) return;
    if (delegatedKey.state.status !== 'idle') return;
    if (isAuthRequest) return;
    autoKeyStartedRef.current = true;

    if (isInsideTelegram() && !requestId) {
      delegatedKey.start();
    } else {
      delegatedKey.unlock();
    }
  }, [authenticated, smartAddress, eoaAddress, delegatedKey.state.status, isAuthRequest, requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <LoadingSpinner />;

  if (!authenticated || !privyToken) {
    if (isInsideTelegram() && !tmaLoginTimedOut) return <LoadingSpinner />;
    return <LoginView />;
  }

  if (!requestId) {
    const delegatedAddress =
      delegatedKey.state.status === 'done' ? delegatedKey.state.record.address : null;
    return (
      <StatusView
        eoaAddress={eoaAddress}
        smartAddress={smartAddress}
        privyToken={privyToken}
        backendUrl={backendUrl}
        delegatedAddress={delegatedAddress}
        delegationState={delegatedKey.state}
        removeKey={delegatedKey.removeKey}
      />
    );
  }

  if (requestLoading) return <LoadingSpinner />;
  if (requestError) return <FullScreenError message={requestError} showClose />;
  if (!request) return <FullScreenError message="Unknown request type" showClose />;

  switch (request.requestType) {
    case 'auth':
      return (
        <AuthHandler
          request={request}
          privyToken={privyToken}
          backendUrl={backendUrl}
          delegatedKeyState={delegatedKey.state}
          startDelegatedKey={delegatedKey.start}
        />
      );
    case 'sign':
      if (request.kind === 'yield_deposit' || request.kind === 'yield_withdraw') {
        return (
          <YieldDepositHandler
            request={request}
            privyToken={privyToken}
            backendUrl={backendUrl}
            serializedBlob={delegatedKey.serializedBlob}
            mode={request.kind === 'yield_deposit' ? 'deposit' : 'withdraw'}
          />
        );
      }
      return (
        <SignHandler
          request={request}
          privyToken={privyToken}
          backendUrl={backendUrl}
          serializedBlob={delegatedKey.serializedBlob}
        />
      );
    case 'approve':
      return (
        <ApproveHandler
          request={request}
          privyToken={privyToken}
          backendUrl={backendUrl}
          delegatedKeyState={delegatedKey.state}
          startDelegatedKey={delegatedKey.start}
        />
      );
    case 'onramp':
      return <OnrampHandler request={request} />;
  }
}
