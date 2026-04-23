import React from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useDelegatedKey } from "./hooks/useDelegatedKey";
import { useRequest } from "./hooks/useRequest";
import { AuthHandler } from "./components/handlers/AuthHandler";
import { SignHandler } from "./components/handlers/SignHandler";
import { ApproveHandler } from "./components/handlers/ApproveHandler";
import { StatusView } from "./components/StatusView";
import type {
  AuthRequest,
  SignRequest,
  ApproveRequest,
} from "./types/miniAppRequest.types";
import { usePrivyToken } from "./hooks/privy";
import { LoadingSpinner } from "./components/atomics/spinner";
import { LoginView } from "./components/views/login";
import { ErrorView } from "./components/views/error";

const TMA_AUTO_LOGIN_TIMEOUT_MS = 4000;

function isInsideTelegram() {
  return !!window.Telegram?.WebApp?.initData;
}

export default function App() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { client } = useSmartWallets();
  const privyToken = usePrivyToken();
  const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? "";
  const [tmaLoginTimedOut, setTmaLoginTimedOut] = React.useState(false);

  React.useEffect(() => {
    if (!isInsideTelegram()) return;
    const t = setTimeout(
      () => setTmaLoginTimedOut(true),
      TMA_AUTO_LOGIN_TIMEOUT_MS,
    );
    return () => clearTimeout(t);
  }, []);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const eoaAddress = (embeddedWallet ?? wallets[0])?.address ?? "";
  const smartAddress = client?.account?.address ?? "";

  const delegatedKey = useDelegatedKey({
    smartAccountAddress: smartAddress,
    signerAddress: eoaAddress,
    signerWallet: embeddedWallet,
    privyDid: user?.id ?? "",
  });

  const {
    requestId,
    request,
    loading: requestLoading,
    error: requestError,
  } = useRequest(backendUrl);

  // After login, auto-unlock an existing stored keypair. Skip for auth requests —
  // AuthHandler calls start() directly which handles both unlock and create paths.
  const isAuthRequest = request?.requestType === 'auth';
  React.useEffect(() => {
    if (!authenticated || !smartAddress || !eoaAddress) return;
    if (delegatedKey.state.status !== "idle") return;
    if (isAuthRequest) return;
    delegatedKey.unlock();
  }, [
    authenticated,
    smartAddress,
    eoaAddress,
    delegatedKey.state.status,
    delegatedKey.unlock,
    isAuthRequest,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Privy not ready ────────────────────────────────────────────────────────
  if (!ready) return <LoadingSpinner />;

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!authenticated || !privyToken) {
    if (isInsideTelegram() && !tmaLoginTimedOut) return <LoadingSpinner />;
    return <LoginView />;
  }

  // ── No requestId — auth-gated status page ──────────────────────────────────
  if (!requestId) {
    return (
      <StatusView
        eoaAddress={eoaAddress}
        smartAddress={smartAddress}
        privyToken={privyToken}
        getAccessToken={getAccessToken}
        removeKey={import.meta.env.DEV ? delegatedKey.removeKey : undefined}
      />
    );
  }

  // ── Request fetch in progress or failed ────────────────────────────────────
  if (requestLoading) return <LoadingSpinner />;

  if (requestError) return <ErrorView message={requestError} />;

  // ── Dispatch to typed handler ──────────────────────────────────────────────
  if (request!.requestType === "auth") {
    return (
      <AuthHandler
        request={request as AuthRequest}
        privyToken={privyToken}
        backendUrl={backendUrl}
        delegatedKeyState={delegatedKey.state}
        startDelegatedKey={delegatedKey.start}
      />
    );
  }

  if (request!.requestType === "sign") {
    return (
      <SignHandler
        request={request as SignRequest}
        privyToken={privyToken}
        backendUrl={backendUrl}
        serializedBlob={delegatedKey.serializedBlob}
      />
    );
  }

  if (request!.requestType === "approve") {
    return (
      <ApproveHandler
        request={request as ApproveRequest}
        privyToken={privyToken}
        backendUrl={backendUrl}
        delegatedKeyState={delegatedKey.state}
        startDelegatedKey={delegatedKey.start}
      />
    );
  }

  return <ErrorView message="Unknown request type" />;
}
