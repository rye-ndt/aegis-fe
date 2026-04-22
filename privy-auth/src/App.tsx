import React from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useSigningRequests } from './hooks/useSigningRequests';
import { SigningRequestModal } from './components/SigningRequestModal';
import { DebugLog } from './components/DebugLog';
import { useDelegatedKey } from './hooks/useDelegatedKey';
import { ApprovalOnboarding } from './components/ApprovalOnboarding';
import type { PendingSigningRequest as BotSigningRequest } from './hooks/useSigningRequests';

// ─── Icons ────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"
        fill="url(#shield-gradient)"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id="shield-gradient"
          x1="3"
          y1="2"
          x2="21"
          y2="23"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Shared UI components ─────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center w-full min-h-dvh bg-[#0f0f1a]">
      <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
    </div>
  );
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="w-full max-w-sm">
      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1.5 px-1">
        {label}
      </p>
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <div className="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        <p className="font-mono text-xs text-white/80 tracking-wide break-all">
          {address}
        </p>
      </div>
    </div>
  );
}

function TokenRow({ getToken, preview }: { getToken: () => Promise<string | null>; preview: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      // Always fetch a fresh token at copy-time so it isn't stale by the time
      // the user sends it to the bot.
      const fresh = await getToken();
      if (!fresh) return;
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable in non-secure context
    }
  };

  return (
    <div className="w-full max-w-sm">
      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1.5 px-1">
        Agent Auth Token
      </p>
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <p className="font-mono text-xs text-white/80 tracking-wide truncate flex-1">
          {preview.slice(0, 32)}…
        </p>
        <button
          onClick={copy}
          className="text-xs text-violet-400 hover:text-violet-300 flex-shrink-0 transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[10px] text-white/20 mt-1.5 px-1">
        Send to the bot with: /auth &lt;token&gt;
      </p>
    </div>
  );
}

// ─── Custom hook ──────────────────────────────────────────────────────────────

function usePrivySession() {
  const { authenticated, getAccessToken } = usePrivy();
  const [privyToken, setPrivyToken] = React.useState<string | null>(null);
  // backendJwt is set to the Privy token after /auth/privy completes (user created/linked in DB)
  const [backendJwt, setBackendJwt] = React.useState<string | null>(null);

  React.useEffect(() => {
    console.log('[AEGIS:auth] authenticated changed:', authenticated);
    if (!authenticated) {
      setPrivyToken(null);
      setBackendJwt(null);
      return;
    }
    console.log('[AEGIS:auth] calling getAccessToken()');
    getAccessToken().then(t => {
      console.log('[AEGIS:auth] privyToken obtained:', t ? `${t.slice(0, 20)}…` : 'null');
      setPrivyToken(t);
    });
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!privyToken) return;
    const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';
    console.log('[AEGIS:auth] VITE_BACKEND_URL =', backendUrl || '(EMPTY — check .env!)');
    if (!backendUrl) return;
    const telegramChatId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
    console.log('[AEGIS:auth] telegramChatId from initDataUnsafe =', telegramChatId ?? '(not in Telegram)');
    console.log('[AEGIS:auth] POST /auth/privy to register user + link telegramChatId:', telegramChatId);
    fetch(`${backendUrl}/auth/privy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        privyToken,
        ...(telegramChatId && { telegramChatId }),
      }),
    })
      .then((r) => {
        console.log('[AEGIS:auth] /auth/privy response status:', r.status);
        return r.ok ? r.json() : r.text().then(t => { console.warn('[AEGIS:auth] /auth/privy error body:', t); return Promise.reject(r.status); });
      })
      .then((body: { token?: string; userId?: string }) => {
        // Use the Privy token directly for all API calls — backend now verifies it via Privy SDK
        console.log('[AEGIS:auth] /auth/privy complete, userId:', body.userId, '| using Privy token for API auth');
        setBackendJwt(privyToken);
      })
      .catch((err) => {
        console.warn('[AEGIS:auth] /auth/privy failed:', err);
      });
  }, [privyToken]);

  return { privyToken, getAccessToken, backendJwt };
}

// ─── Views ────────────────────────────────────────────────────────────────────

function ConnectedView({
  eoaAddress,
  smartAddress,
  privyToken,
  getAccessToken,
  pendingBotRequest,
  backendJwt,
  privyDid,
}: {
  eoaAddress: string;
  smartAddress: string;
  privyToken: string | null;
  getAccessToken: () => Promise<string | null>;
  pendingBotRequest: BotSigningRequest | null;
  backendJwt: string | null;
  privyDid: string;
}) {
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');

  const delegatedKeyHook = useDelegatedKey({
    smartAccountAddress: smartAddress,
    signerAddress: eoaAddress,
    signerWallet: embeddedWallet,
    privyDid,
    backendJwt,
  });

  // ── Fetch active delegations to decide which view to show ─────────────────
  const [delegations, setDelegations] = React.useState<unknown[] | null>(null);
  const [delegationsLoading, setDelegationsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!backendJwt) return;
    const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';
    (async () => {
      try {
        const resp = await fetch(`${backendUrl}/delegation/grant`, {
          headers: { Authorization: `Bearer ${backendJwt}` },
        });
        const data = await resp.json();
        setDelegations(data.delegations ?? []);
      } catch {
        // Treat fetch failure as empty → show onboarding
        setDelegations([]);
      } finally {
        setDelegationsLoading(false);
      }
    })();
  }, [backendJwt]);

  // ── Routing ───────────────────────────────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const isReapproval = urlParams.get('reapproval') === '1';
  const isSigningDeepLink = urlParams.has('requestId');

  if (delegationsLoading) return <LoadingSpinner />;

  // Priority 1: signing deep-link (edge-case fallback during transition)
  if (isSigningDeepLink && pendingBotRequest) {
    return (
      <SigningRequestModal
        request={pendingBotRequest}
        onClose={() => { /* pending auto-clears after approve/reject */ }}
      />
    );
  }

  // Priority 2: no delegations yet, or explicit re-approval requested
  if (isReapproval || (delegations !== null && delegations.length === 0)) {
    return (
      <ApprovalOnboarding
        backendJwt={backendJwt ?? ''}
        delegatedKey={{ state: delegatedKeyHook.state, start: delegatedKeyHook.start }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-2xl scale-150" />
        <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-violet-500/10 border border-violet-500/30">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z" fill="url(#shield-connected)" />
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="shield-connected" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7c3aed" />
                <stop offset="1" stopColor="#4f46e5" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <p className="text-xs font-semibold tracking-widest text-violet-400 uppercase">Connected</p>
      {smartAddress && <AddressRow label="Smart Wallet" address={smartAddress} />}
      <AddressRow label="Signer (EOA)" address={eoaAddress} />
      {privyToken && <TokenRow getToken={getAccessToken} preview={privyToken} />}

      <p className="text-xs text-white/30 text-center max-w-xs">
        Aegis Guard is active — return to Telegram to use the bot.
      </p>

      {import.meta.env.DEV && (
        <button
          onClick={delegatedKeyHook.removeKey}
          className="text-xs text-red-500/50 hover:text-red-400 transition-colors duration-200 underline underline-offset-2"
        >
          [dev] Remove session key
        </button>
      )}

      <DebugLog />
    </div>
  );
}


function LoginView() {
  const { login, ready } = usePrivy();

  return (
    <div className="flex flex-col items-center justify-between w-full min-h-dvh bg-[#0f0f1a] px-6 py-12">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative mb-10">
          <div className="absolute inset-0 rounded-full bg-violet-600/30 blur-3xl scale-[2.5]" />
          <div className="relative flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20">
            <ShieldIcon />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
          Aegis
        </h1>
        <p className="text-base text-white/40 text-center max-w-[220px] leading-relaxed">
          Your secure onchain identity, powered by Google
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-px bg-white/[0.08]" />
          <span className="text-xs text-white/25 font-medium">Get started</span>
          <div className="flex-1 h-px bg-white/[0.08]" />
        </div>

        <button
          onClick={login}
          disabled={!ready}
          className="
            group flex items-center justify-center gap-3
            w-full py-4 px-6 rounded-2xl
            bg-white hover:bg-white/95 active:bg-white/90
            text-gray-800 font-semibold text-[15px]
            transition-all duration-150
            shadow-[0_8px_32px_rgba(124,58,237,0.3)]
            hover:shadow-[0_8px_40px_rgba(124,58,237,0.45)]
            active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="text-center text-[11px] text-white/20 leading-relaxed px-2">
          A wallet is created automatically if you don't have one.
        </p>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TMA_AUTO_LOGIN_TIMEOUT_MS = 4000;

// telegram-web-app.js is always loaded in index.html, so window.Telegram.WebApp
// is defined even in a regular browser. Only trust it when initData is non-empty,
// which only happens inside a real Telegram Mini App WebView.
function isInsideTelegram() {
  return !!(window.Telegram?.WebApp?.initData);
}

export default function App() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { client } = useSmartWallets();
  const { privyToken, getAccessToken, backendJwt } = usePrivySession();
  const [tmaLoginTimedOut, setTmaLoginTimedOut] = React.useState(false);

  // If Telegram auto-login doesn't complete within 4 seconds, fall through to LoginView.
  React.useEffect(() => {
    if (!isInsideTelegram()) return;
    const t = setTimeout(() => setTmaLoginTimedOut(true), TMA_AUTO_LOGIN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []); // empty deps: timer fires once on mount; authenticated toggling during Privy session refresh cannot reset it

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');

  const { pending: pendingBotRequest } = useSigningRequests({
    client: client || null,
    jwtToken: backendJwt,
  });

  React.useEffect(() => {
    console.log('[AEGIS:app] ready:', ready, '| authenticated:', authenticated, '| backendJwt:', backendJwt ? `${backendJwt.slice(0, 20)}…` : 'null', '| client:', client ? 'non-null' : 'null');
  }, [ready, authenticated, backendJwt, client]);

  React.useEffect(() => {
    console.log('[AEGIS:app] wallets:', wallets.map(w => `${w.walletClientType}:${w.address}`));
  }, [wallets]);

  // Debug: log wallet addresses whenever they change (dev only).
  React.useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Aegis] EOA:', embeddedWallet?.address, '| Smart wallet:', client?.account?.address);
    }
  }, [embeddedWallet?.address, client?.account?.address]);

  if (!ready) return <LoadingSpinner />;

  if (authenticated) {
    const eoaAddress = (embeddedWallet ?? wallets[0])?.address ?? "";
    const smartAddress = client?.account?.address ?? "";
    return (
      <ConnectedView
        eoaAddress={eoaAddress}
        smartAddress={smartAddress}
        privyToken={privyToken}
        getAccessToken={getAccessToken}
        pendingBotRequest={pendingBotRequest}
        backendJwt={backendJwt}
        privyDid={user?.id ?? ''}
      />
    );
  }

  // Suppress LoginView while TelegramAutoLogin is in flight inside a Telegram WebView.
  // Once authenticated flips to true, the branch above takes over; this spinner
  // only shows during the brief auto-login window. Falls through after 4s if auto-login fails.
  if (isInsideTelegram() && !tmaLoginTimedOut) {
    return <LoadingSpinner />;
  }

  return <LoginView />;
}
