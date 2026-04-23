import { usePrivy } from '@privy-io/react-auth';
import type { DelegationState } from '../hooks/useDelegatedKey';
import { usePortfolio, type PortfolioToken } from '../hooks/useAppData';
import { ShieldIcon } from './atomics/icons';
import { Spinner } from './atomics/spinner';

export function HomeTab({ delegationState }: { delegationState: DelegationState }) {
  const { authenticated, user } = usePrivy();
  const { data: tokens, loading, error } = usePortfolio();

  const totalUsd = tokens?.reduce((sum, t) => sum + (parseFloat(String(t.usdValue ?? 0)) || 0), 0) ?? 0;

  return (
    <div className="flex flex-col items-center gap-6 px-4 pt-10 pb-28">
      <div className="relative mt-2">
        <div className="absolute inset-0 rounded-3xl bg-violet-500/25 blur-3xl scale-[2.2]" />
        <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20">
          <ShieldIcon size={36} />
        </div>
      </div>

      <div className="text-center -mt-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Aegis</h1>
        <p className="text-xs text-white/25 mt-0.5 tracking-wide">Onchain AI Agent</p>
      </div>

      <AuthBadge authenticated={authenticated} email={user?.google?.email} />

      <PortfolioSection
        tokens={tokens}
        loading={loading}
        error={error}
        totalUsd={totalUsd}
      />

      {delegationState.status === 'processing' && (
        <div className="w-full flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
          <Spinner size="sm" className="border-violet-400/30 border-t-violet-400" />
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

function AuthBadge({ authenticated, email }: { authenticated: boolean; email?: string }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold ${
      authenticated
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        : 'bg-red-500/10 border-red-500/20 text-red-400'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${authenticated ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-400'}`} />
      {authenticated ? 'Authenticated' : 'Not Authenticated'}
      {authenticated && email && <span className="text-white/30 font-normal">· {email}</span>}
    </div>
  );
}

function PortfolioSection({
  tokens, loading, error, totalUsd,
}: {
  tokens: PortfolioToken[] | null;
  loading: boolean;
  error: string | null;
  totalUsd: number;
}) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-0.5">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Portfolio</p>
        {!loading && !error && tokens != null && (
          <p className="text-[11px] text-white/40">≈ ${totalUsd.toFixed(2)}</p>
        )}
      </div>

      {loading && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-white/[0.04] border border-white/[0.05] rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && <PortfolioEmpty label={error} />}
      {!loading && !error && tokens?.length === 0 && <PortfolioEmpty label="No tokens found" />}

      {!loading && !error && tokens && tokens.length > 0 && (
        <div className="flex flex-col gap-2">
          {tokens.map((t, i) => <TokenRow key={i} token={t} />)}
        </div>
      )}
    </div>
  );
}

function PortfolioEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-20 bg-white/[0.03] border border-white/[0.05] rounded-xl">
      <p className="text-xs text-white/25">{label}</p>
    </div>
  );
}

function TokenRow({ token }: { token: PortfolioToken }) {
  const symbol = token.symbol ?? '—';
  const bal = parseFloat(String(token.balance ?? '0'));
  const usd = token.usdValue != null ? parseFloat(String(token.usdValue)) : null;
  const initials = symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();

  return (
    <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3">
      <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] font-bold text-violet-400 tracking-tight">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white/90">{symbol}</p>
        {token.name && <p className="text-[10px] text-white/30 truncate">{token.name}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-white/70 font-mono">{isNaN(bal) ? '—' : bal.toFixed(4)}</p>
        {usd != null && <p className="text-[10px] text-white/30 mt-0.5">${usd.toFixed(2)}</p>}
      </div>
    </div>
  );
}
