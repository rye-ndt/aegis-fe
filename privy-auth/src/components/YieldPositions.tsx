import type { YieldPosition } from '../hooks/useAppData';
import { useYieldPositions } from '../hooks/useAppData';
import { Spinner } from './atomics/spinner';

export function YieldPositions() {
  const { data, loading, error } = useYieldPositions();

  const positions = data?.positions ?? [];
  const totals = data?.totals;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-0.5">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
          Yield Positions
        </p>
        {!loading && !error && totals && positions.length > 0 && (
          <p className="text-[11px] text-white/40">≈ ${totals.currentValueHuman}</p>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-14 bg-white/[0.03] border border-white/[0.05] rounded-xl gap-2">
          <Spinner size="xs" />
          <p className="text-xs text-white/30">Loading positions…</p>
        </div>
      )}

      {!loading && error && <YieldEmpty label={error} />}

      {!loading && !error && positions.length === 0 && (
        <YieldEmpty label="No active yield positions. Try /yield in Telegram." />
      )}

      {!loading && !error && positions.length > 0 && (
        <div className="flex flex-col gap-2">
          {positions.map((p, i) => (
            <PositionRow key={`${p.protocolId}-${p.tokenSymbol}-${i}`} position={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function YieldEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-14 bg-white/[0.03] border border-white/[0.05] rounded-xl">
      <p className="text-xs text-white/25 text-center px-4">{label}</p>
    </div>
  );
}

function PositionRow({ position: p }: { position: YieldPosition }) {
  const pnlPositive = p.pnlHuman.startsWith('+') || parseFloat(p.pnlHuman) >= 0;
  const pnl24hPositive = p.pnl24hHuman.startsWith('+') || parseFloat(p.pnl24hHuman) >= 0;
  const initials = p.tokenSymbol.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase();

  return (
    <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3">
      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] font-bold text-emerald-400 tracking-tight">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-white/90">{p.protocolName}</p>
          <span className="text-[9px] text-white/30">·</span>
          <p className="text-[10px] text-white/50">{p.tokenSymbol}</p>
        </div>
        <p className="text-[10px] text-emerald-400/70 mt-0.5">
          {(p.apy * 100).toFixed(2)}% APY
        </p>
      </div>
      <div className="text-right flex-shrink-0 flex flex-col gap-0.5">
        <p className="text-xs text-white/70 font-mono">${p.currentValueHuman}</p>
        <p className={`text-[10px] font-mono ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {p.pnlHuman}
        </p>
        <p className={`text-[9px] font-mono ${pnl24hPositive ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
          24h {p.pnl24hHuman}
        </p>
      </div>
    </div>
  );
}
