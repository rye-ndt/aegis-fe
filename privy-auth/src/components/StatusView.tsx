import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useDebugEntries } from './DebugLog';
import type { DelegationState } from '../hooks/useDelegatedKey';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'home' | 'configs' | 'debug';

type GrantPermission = {
  tokenAddress?: string;
  symbol?: string;
  name?: string;
  maxAmount?: string | number;
  validUntil?: number;
  spent?: string | number;
};

type PortfolioToken = {
  symbol?: string;
  name?: string;
  balance?: string | number;
  usdValue?: string | number | null;
  tokenAddress?: string;
  contractAddress?: string;
};

// ── Portfolio hook ─────────────────────────────────────────────────────────────

function usePortfolio(backendUrl: string, privyToken: string) {
  const [tokens, setTokens] = React.useState<PortfolioToken[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!privyToken || !backendUrl) return;
    setLoading(true);
    setError(null);
    fetch(`${backendUrl}/portfolio`, {
      headers: { Authorization: `Bearer ${privyToken}` },
    })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<Record<string, unknown>>;
      })
      .then(data => {
        const raw = ((data.tokens ?? data.balances ?? data.items ?? []) as PortfolioToken[]);
        const sorted = [...raw]
          .sort((a, b) => {
            const va = parseFloat(String(a.usdValue ?? 0)) || 0;
            const vb = parseFloat(String(b.usdValue ?? 0)) || 0;
            return vb - va;
          })
          .slice(0, 10);
        setTokens(sorted);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load balance');
        setLoading(false);
      });
  }, [backendUrl, privyToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return { tokens, loading, error };
}

// ── Grant permissions hook ─────────────────────────────────────────────────────

function useGrantPermissions(backendUrl: string, privyToken: string, enabled: boolean) {
  const [grants, setGrants] = React.useState<GrantPermission[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !privyToken || !backendUrl) return;
    setLoading(true);
    setError(null);
    fetch(`${backendUrl}/delegation/grant`, {
      headers: { Authorization: `Bearer ${privyToken}` },
    })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<Record<string, unknown>>;
      })
      .then(data => {
        const raw = (
          data.grants ??
          data.delegations ??
          data.permissions ??
          data.items ??
          (Array.isArray(data) ? data : [])
        ) as GrantPermission[];
        setGrants(raw);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load permissions');
        setLoading(false);
      });
  }, [enabled, backendUrl, privyToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return { grants, loading, error };
}

// ── Tab icons ─────────────────────────────────────────────────────────────────

function HomeTabIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ConfigTabIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function DebugTabIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

// ── Shared atoms ──────────────────────────────────────────────────────────────

function AddressCard({ label, desc, address }: { label: string; desc?: string; address: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1.5 px-0.5">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">{label}</p>
        {desc && <p className="text-[10px] text-white/20">{desc}</p>}
      </div>
      <button
        onClick={copy}
        className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-xl px-4 py-3.5 transition-colors text-left group"
      >
        <div className="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        <p className="font-mono text-xs text-white/80 break-all flex-1 min-w-0">{address}</p>
        <span className="text-[11px] flex-shrink-0 transition-colors text-white/20 group-hover:text-violet-400">
          {copied ? '✓' : 'copy'}
        </span>
      </button>
    </div>
  );
}

// ── Remove agent modal ────────────────────────────────────────────────────────

function RemoveAgentModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={!loading ? onCancel : undefined} />
      <div className="relative w-full max-w-sm bg-[#161624] border border-white/10 rounded-2xl p-6 flex flex-col gap-5 shadow-[0_-8px_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Disconnect AI Agent?</p>
            <p className="text-white/40 text-[11px] mt-0.5">This cannot be undone from here</p>
          </div>
        </div>

        <p className="text-white/60 text-[13px] leading-relaxed">
          The agent will no longer be able to automatically execute transactions on your behalf.
          You'll need to reconnect it the next time you open Aegis.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/70 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            Keep Connected
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading
              ? <div className="w-4 h-4 rounded-full border-2 border-red-400/30 border-t-red-400 animate-spin" />
              : 'Disconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Home tab ──────────────────────────────────────────────────────────────────

function HomeTab({
  backendUrl,
  privyToken,
  delegationState,
}: {
  backendUrl: string;
  privyToken: string;
  delegationState: DelegationState;
}) {
  const { authenticated, user } = usePrivy();
  const { tokens, loading, error } = usePortfolio(backendUrl, privyToken);

  const totalUsd = tokens?.reduce((sum, t) => sum + (parseFloat(String(t.usdValue ?? 0)) || 0), 0) ?? 0;

  return (
    <div className="flex flex-col items-center gap-6 px-4 pt-10 pb-28">
      {/* App icon */}
      <div className="relative mt-2">
        <div className="absolute inset-0 rounded-3xl bg-violet-500/25 blur-3xl scale-[2.2]" />
        <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"
              fill="url(#home-shield-g)" />
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="home-shield-g" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7c3aed" />
                <stop offset="1" stopColor="#4f46e5" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <div className="text-center -mt-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Aegis</h1>
        <p className="text-xs text-white/25 mt-0.5 tracking-wide">Onchain AI Agent</p>
      </div>

      {/* Auth status badge */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold ${
        authenticated
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-red-500/10 border-red-500/20 text-red-400'
      }`}>
        <div className={`w-1.5 h-1.5 rounded-full ${authenticated ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-400'}`} />
        {authenticated ? 'Authenticated' : 'Not Authenticated'}
        {authenticated && user?.google?.email && (
          <span className="text-white/30 font-normal">· {user.google.email}</span>
        )}
      </div>

      {/* Portfolio */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-3 px-0.5">
          <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Portfolio</p>
          {!loading && !error && tokens != null && (
            <p className="text-[11px] text-white/40">≈ ${totalUsd.toFixed(2)}</p>
          )}
        </div>

        {loading && (
          <div className="flex flex-col gap-2.5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-white/[0.04] border border-white/[0.05] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center h-20 bg-white/[0.03] border border-white/[0.05] rounded-xl">
            <p className="text-xs text-white/25">{error}</p>
          </div>
        )}

        {!loading && !error && tokens?.length === 0 && (
          <div className="flex items-center justify-center h-20 bg-white/[0.03] border border-white/[0.05] rounded-xl">
            <p className="text-xs text-white/25">No tokens found</p>
          </div>
        )}

        {!loading && !error && tokens && tokens.length > 0 && (
          <div className="flex flex-col gap-2">
            {tokens.map((t, i) => {
              const symbol = t.symbol ?? '—';
              const bal = parseFloat(String(t.balance ?? '0'));
              const usd = t.usdValue != null ? parseFloat(String(t.usdValue)) : null;
              const initials = symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();

              return (
                <div key={i} className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-violet-400 tracking-tight">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white/90">{symbol}</p>
                    {t.name && <p className="text-[10px] text-white/30 truncate">{t.name}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-white/70 font-mono">{isNaN(bal) ? '—' : bal.toFixed(4)}</p>
                    {usd != null && (
                      <p className="text-[10px] text-white/30 mt-0.5">${usd.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent setup banner — shown while auto-creating keypair */}
      {delegationState.status === 'processing' && (
        <div className="w-full flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
          <div className="w-4 h-4 flex-shrink-0 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-violet-300">Setting up AI Agent</p>
            <p className="text-[11px] text-violet-400/60 truncate mt-0.5">{delegationState.step}</p>
          </div>
        </div>
      )}

      {delegationState.status === 'error' && (
        <div className="w-full flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
          <div className="w-4 h-4 flex-shrink-0 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
            <span className="text-red-400 text-[9px] font-bold leading-none">!</span>
          </div>
          <p className="text-xs text-red-400/80 flex-1 min-w-0 truncate">{delegationState.message}</p>
        </div>
      )}
    </div>
  );
}

// ── Configs tab ───────────────────────────────────────────────────────────────

function PermissionsSection({
  backendUrl,
  privyToken,
}: {
  backendUrl: string;
  privyToken: string;
}) {
  const { grants, loading, error } = useGrantPermissions(backendUrl, privyToken, true);

  const formatAmount = (raw: string | number | undefined) => {
    if (raw == null) return '—';
    const n = parseFloat(String(raw));
    if (isNaN(n)) return String(raw);
    if (n >= 1e18) return `${(n / 1e18).toFixed(4)} (18 dec)`;
    if (n >= 1e6) return (n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const formatExpiry = (ts: number | undefined) => {
    if (!ts) return null;
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const truncateAddr = (addr: string) =>
    addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-semibold tracking-widest text-white/20 uppercase px-0.5">
        What the agent can do
      </p>

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 bg-white/[0.03] border border-white/[0.05] rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-center h-14 bg-white/[0.03] border border-white/[0.05] rounded-xl">
          <p className="text-[11px] text-white/25">{error}</p>
        </div>
      )}

      {!loading && !error && grants?.length === 0 && (
        <div className="flex items-center justify-center h-14 bg-white/[0.03] border border-white/[0.05] rounded-xl">
          <p className="text-[11px] text-white/25">No spending permissions granted</p>
        </div>
      )}

      {!loading && !error && grants && grants.length > 0 && (
        <div className="flex flex-col gap-2">
          {grants.map((g, i) => {
            const label = g.symbol ?? truncateAddr(g.tokenAddress ?? '');
            const expiry = formatExpiry(g.validUntil);
            const isExpired = g.validUntil != null && g.validUntil * 1000 < Date.now();
            const spentRaw = g.spent != null ? parseFloat(String(g.spent)) : null;
            const maxRaw = g.maxAmount != null ? parseFloat(String(g.maxAmount)) : null;
            const pct = spentRaw != null && maxRaw != null && maxRaw > 0
              ? Math.min(100, (spentRaw / maxRaw) * 100)
              : null;

            return (
              <div key={i} className={`bg-white/[0.03] border rounded-xl px-4 py-3.5 flex flex-col gap-2 ${isExpired ? 'border-white/[0.05] opacity-50' : 'border-white/[0.07]'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-violet-400">
                        {(g.symbol ?? '?').slice(0, 3).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-white/85">{label}</p>
                  </div>
                  {isExpired && (
                    <span className="text-[9px] text-red-400/70 font-semibold uppercase tracking-wide">Expired</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/35">Spending limit</span>
                  <span className="text-white/65 font-mono">{formatAmount(g.maxAmount)}</span>
                </div>

                {pct !== null && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white/25">Used</span>
                      <span className="text-white/40">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-400/60' : 'bg-violet-400/60'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {expiry && (
                  <p className="text-[10px] text-white/25">
                    {isExpired ? 'Expired' : 'Expires'} {expiry}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigsTab({
  eoaAddress,
  smartAddress,
  delegatedAddress,
  backendUrl,
  privyToken,
  removeKey,
}: {
  eoaAddress: string;
  smartAddress: string;
  delegatedAddress: string | null;
  backendUrl: string;
  privyToken: string;
  removeKey: () => Promise<void>;
}) {
  const [showModal, setShowModal] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [removed, setRemoved] = React.useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeKey();
      setRemoved(true);
      setShowModal(false);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-7 px-4 pt-10 pb-28">
      {/* Wallet section */}
      <div className="flex flex-col gap-4">
        <p className="text-[10px] font-semibold tracking-widest text-white/20 uppercase px-0.5">Your Wallet</p>
        {smartAddress && (
          <AddressCard label="Smart Account" desc="receives funds" address={smartAddress} />
        )}
        <AddressCard label="Signing Address" desc="EOA" address={eoaAddress} />
      </div>

      {/* Agent section */}
      <div className="flex flex-col gap-4">
        <p className="text-[10px] font-semibold tracking-widest text-white/20 uppercase px-0.5">AI Agent</p>

        {delegatedAddress ? (
          <AddressCard label="Agent Address" desc="delegated key" address={delegatedAddress} />
        ) : (
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3.5">
            <div className="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-white/15" />
            <p className="text-xs text-white/25">No agent connected</p>
          </div>
        )}

        {/* Disconnect card */}
        {!removed ? (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/80 mb-1">Disconnect AI Agent</p>
                <p className="text-[11px] text-white/35 leading-relaxed">
                  Stop the agent from automatically executing trades and transactions on your behalf.
                </p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex-shrink-0 mt-0.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-semibold hover:bg-red-500/15 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3.5">
            <div className="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            <p className="text-xs text-emerald-400">Agent disconnected — reload to reconnect</p>
          </div>
        )}
      </div>

      {/* Permissions */}
      <PermissionsSection backendUrl={backendUrl} privyToken={privyToken} />

      {showModal && (
        <RemoveAgentModal
          onConfirm={handleRemove}
          onCancel={() => setShowModal(false)}
          loading={removing}
        />
      )}
    </div>
  );
}

// ── Debug tab ─────────────────────────────────────────────────────────────────

function DebugTab() {
  const { entries } = useDebugEntries();
  const [copied, setCopied] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  const copy = () => {
    const text = entries.map(e => `[${e.ts}] ${e.text}`).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="flex flex-col px-4 pt-10 pb-28">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Console</p>
          <p className="text-[10px] text-white/20 mt-0.5">{entries.length} entries</p>
        </div>
        <button
          onClick={copy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
            copied
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-white/[0.04] border-white/10 text-violet-400 hover:bg-white/[0.08]'
          }`}
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Logs
            </>
          )}
        </button>
      </div>

      <div
        className="bg-black/60 border border-white/10 rounded-xl px-3 py-3 overflow-y-auto font-mono text-[10px] leading-relaxed"
        style={{ minHeight: 'calc(100dvh - 220px)' }}
      >
        {entries.length === 0 && (
          <p className="text-white/20 text-center py-8">No logs yet…</p>
        )}
        {entries.map((e, i) => (
          <p key={i} className={`py-px ${e.level === 'warn' ? 'text-yellow-400' : 'text-white/70'}`}>
            <span className="text-white/25 select-none">{e.ts} </span>{e.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Floating tab dock ─────────────────────────────────────────────────────────

function TabDock({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; Icon: React.FC<{ active: boolean }> }[] = [
    { id: 'home', label: 'Home', Icon: HomeTabIcon },
    { id: 'configs', label: 'Config', Icon: ConfigTabIcon },
    { id: 'debug', label: 'Debug', Icon: DebugTabIcon },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-6 px-6 pointer-events-none z-40">
      <nav
        className="flex items-center gap-1 bg-[#1a1a2e]/90 backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)] pointer-events-auto"
        role="tablist"
      >
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={active === id}
            onClick={() => onChange(id)}
            className={`flex flex-col items-center gap-1 px-5 py-2.5 rounded-xl transition-all duration-200 ${
              active === id
                ? 'bg-violet-500/20 text-violet-400'
                : 'text-white/25 hover:text-white/60 hover:bg-white/[0.04]'
            }`}
          >
            <Icon active={active === id} />
            <span className="text-[9px] font-bold tracking-widest uppercase">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── StatusView ────────────────────────────────────────────────────────────────

export function StatusView({
  eoaAddress,
  smartAddress,
  privyToken,
  backendUrl,
  delegatedAddress,
  delegationState,
  removeKey,
}: {
  eoaAddress: string;
  smartAddress: string;
  privyToken: string;
  backendUrl: string;
  delegatedAddress: string | null;
  delegationState: DelegationState;
  removeKey: () => Promise<void>;
}) {
  const [tab, setTab] = React.useState<Tab>('home');

  return (
    <div className="w-full min-h-dvh bg-[#0f0f1a] overflow-y-auto">
      {tab === 'home' && (
        <HomeTab
          backendUrl={backendUrl}
          privyToken={privyToken}
          delegationState={delegationState}
        />
      )}
      {tab === 'configs' && (
        <ConfigsTab
          eoaAddress={eoaAddress}
          smartAddress={smartAddress}
          delegatedAddress={delegatedAddress}
          backendUrl={backendUrl}
          privyToken={privyToken}
          removeKey={removeKey}
        />
      )}
      {tab === 'debug' && <DebugTab />}

      <TabDock active={tab} onChange={setTab} />
    </div>
  );
}
