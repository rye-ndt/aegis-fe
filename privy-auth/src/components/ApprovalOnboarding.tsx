import React from 'react';
import type { DelegationState } from '../hooks/useDelegatedKey';
import { cloudStorageRemoveItem } from '../utils/telegramStorage';
import { loggedFetch } from '../utils/loggedFetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovalParam {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  suggestedLimitRaw: string;   // raw integer string (e.g. "500000000" for 500 USDC)
  validUntil: number;          // unix epoch seconds
}

interface DelegationPayload {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  limitRaw: string;
  validUntil: number;
}

interface ApprovalOnboardingProps {
  backendJwt: string;
  delegatedKey: {
    state: DelegationState;
    start: () => void;
  };
  reapproval?: boolean;
  tokenAddress?: string;
  amountRaw?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';

function toHumanAmount(rawStr: string, decimals: number): string {
  try {
    const raw = BigInt(rawStr);
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    if (fraction === 0n) return whole.toString();
    const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole}.${fractionStr}`;
  } catch {
    return rawStr;
  }
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div className="flex justify-center py-6">
      <div className="w-6 h-6 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalOnboarding({
  backendJwt,
  delegatedKey,
  reapproval = false,
  tokenAddress,
  amountRaw,
}: ApprovalOnboardingProps) {
  const [approvalParams, setApprovalParams] = React.useState<ApprovalParam[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isApproveClicked, setIsApproveClicked] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const [postError, setPostError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  // ── On mount: fetch suggested limits using props (never read URL) ─────────
  React.useEffect(() => {
    const qs = tokenAddress && amountRaw
      ? `?tokenAddress=${encodeURIComponent(tokenAddress)}&amountRaw=${encodeURIComponent(amountRaw)}`
      : '';

    loggedFetch(`${backendUrl}/delegation/approval-params${qs}`, {
      headers: { Authorization: `Bearer ${backendJwt}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data: { tokens: ApprovalParam[] }) => {
        setApprovalParams(data.tokens ?? []);
      })
      .catch((err) => {
        setLoadError(toErrorMessage(err));
      });
  }, [backendJwt]);

  // ── Watch for delegation install completion → post limits ─────────────────
  React.useEffect(() => {
    if (!isApproveClicked) return;
    if (delegatedKey.state.status !== 'done') return;
    if (!approvalParams) return;
    if (posting || success) return;

    setPosting(true);
    setPostError(null);

    const delegations: DelegationPayload[] = approvalParams.map((p) => ({
      tokenAddress: p.tokenAddress,
      tokenSymbol: p.tokenSymbol,
      tokenDecimals: p.tokenDecimals,
      limitRaw: p.suggestedLimitRaw,
      validUntil: p.validUntil,
    }));

    loggedFetch(`${backendUrl}/delegation/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${backendJwt}`,
      },
      body: JSON.stringify({ delegations }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Backend returned ${r.status}`);
        setSuccess(true);
        // Close TMA after short delay
        setTimeout(() => window.Telegram?.WebApp?.close(), 1500);
      })
      .catch((err) => {
        setPostError(toErrorMessage(err));
      })
      .finally(() => {
        setPosting(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegatedKey.state.status, isApproveClicked]);

  const handleApprove = React.useCallback(() => {
    setIsApproveClicked(true);
    delegatedKey.start();
  }, [delegatedKey]);

  const isReapproval = reapproval;

  // ── Compute composite UI states ───────────────────────────────────────────
  const isInstalling =
    isApproveClicked &&
    (delegatedKey.state.status === 'processing' || delegatedKey.state.status === 'idle');
  const installError =
    isApproveClicked && delegatedKey.state.status === 'error'
      ? delegatedKey.state.message
      : null;
  const isWorking = isInstalling || posting;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-6">
      {/* Header */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-2xl scale-150" />
        <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-violet-500/10 border border-violet-500/30">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"
              fill="url(#shield-onboard)"
            />
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="shield-onboard" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7c3aed" />
                <stop offset="1" stopColor="#4f46e5" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <div className="text-center max-w-xs">
        <h1 className="text-xl font-bold text-white mb-2">
          {isReapproval ? 'Renew Spending Limit' : 'Enable Autonomous Trading'}
        </h1>
        <p className="text-sm text-white/40 leading-relaxed">
          {isReapproval
            ? 'Your spending limit has been reached. Approve a new limit to let the bot continue trading on your behalf.'
            : 'To let the bot trade on your behalf, approve the following spending limits (one-time, revocable):'}
        </p>
      </div>

      {/* Token list */}
      {!loadError && !success && (
        <div className="w-full max-w-sm flex flex-col gap-3">
          {!approvalParams ? (
            // Loading approval params
            <Spinner />
          ) : approvalParams.length === 0 ? (
            <p className="text-xs text-white/30 text-center">No token limits required.</p>
          ) : (
            approvalParams.map((p) => (
              <div
                key={p.tokenAddress}
                className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-violet-300">
                      {p.tokenSymbol.slice(0, 2)}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-white">{p.tokenSymbol}</span>
                </div>
                <span className="text-sm text-violet-300 font-semibold">
                  {toHumanAmount(p.suggestedLimitRaw, p.tokenDecimals)} {p.tokenSymbol}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Error: failed to load params */}
      {loadError && !success && (
        <div className="w-full max-w-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-red-400 mb-3">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* Progress step */}
      {isInstalling && delegatedKey.state.status === 'processing' && (
        <p className="text-xs text-white/40 text-center max-w-xs animate-pulse">
          {delegatedKey.state.step}
        </p>
      )}
      {posting && (
        <p className="text-xs text-white/40 text-center max-w-xs animate-pulse">
          Saving limits…
        </p>
      )}

      {/* Error: install or posting */}
      {(installError || postError) && (
        <p className="text-xs text-red-400 text-center max-w-xs break-all">
          {installError ?? postError}
        </p>
      )}

      {/* Success */}
      {success && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">✅</div>
          <p className="text-white font-semibold">All set!</p>
          <p className="text-sm text-white/40 max-w-xs leading-relaxed">
            The bot is ready to trade on your behalf. Return to Telegram to get started.
          </p>
        </div>
      )}

      {/* Approve button */}
      {!success && (
        <button
          id="approve-delegation-btn"
          onClick={handleApprove}
          disabled={isWorking || !approvalParams || !!loadError}
          className="
            w-full max-w-sm py-4 rounded-2xl font-semibold text-[15px] text-white
            bg-violet-600 hover:bg-violet-500 active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed
            shadow-[0_8px_32px_rgba(124,58,237,0.3)]
            hover:shadow-[0_8px_40px_rgba(124,58,237,0.45)]
            transition-all duration-150
          "
        >
          {isWorking ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              {posting ? 'Saving…' : 'Approving…'}
            </span>
          ) : (
            'Approve'
          )}
        </button>
      )}

      {/* Fine print */}
      {!success && approvalParams && approvalParams.length > 0 && (
        <p className="text-[11px] text-white/20 text-center max-w-xs leading-relaxed px-2">
          These limits are enforced by the Aegis server. You can revoke access at any time.
        </p>
      )}

      {import.meta.env.DEV && (
        <button
          onClick={async () => {
            await cloudStorageRemoveItem('delegated_key').catch(() => {});
            window.location.reload();
          }}
          className="text-xs text-red-500/50 hover:text-red-400 transition-colors duration-200 underline underline-offset-2 mt-2"
        >
          [dev] Wipe CloudStorage + reload
        </button>
      )}
    </div>
  );
}
