import React from 'react';
import type { PmPosition } from '../hooks/useAppData';
import { usePmPositions } from '../hooks/useAppData';
import { Spinner } from './atomics/spinner';
import { ClosePositionSheet } from './ClosePositionSheet';
import { createLogger } from '../utils/logger';

const log = createLogger('predictionPositions');

export function PredictionPositions() {
  const { data, loading, error, refetch } = usePmPositions();
  const [sheetPosition, setSheetPosition] = React.useState<PmPosition | null>(null);

  const positions = data?.positions ?? [];

  const anyNullValue = positions.some((p) => p.currentValueUsdcCents == null);
  const totalUsd = anyNullValue
    ? null
    : positions.reduce((sum, p) => sum + ((p.currentValueUsdcCents ?? 0) / 100), 0);

  const onTap = (p: PmPosition) => {
    if (p.status !== 'open') return;
    log.info('row-tapped', { positionId: p.id });
    setSheetPosition(p);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 px-0.5">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
          Prediction Positions
        </p>
        {!loading && !error && totalUsd != null && positions.length > 0 && (
          <p className="text-[11px] text-white/40">≈ ${totalUsd.toFixed(2)}</p>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-14 bg-white/[0.03] border border-white/[0.05] rounded-xl gap-2">
          <Spinner size="xs" />
          <p className="text-xs text-white/30">Loading positions…</p>
        </div>
      )}

      {!loading && error && <PmEmpty label={error} />}

      {!loading && !error && positions.length === 0 && (
        <PmEmpty label="No open prediction positions. Try /bet in Telegram." />
      )}

      {!loading && !error && positions.length > 0 && (
        <div className="flex flex-col gap-2">
          {positions.map((p) => (
            <PositionRow key={p.id} position={p} onTap={() => onTap(p)} />
          ))}
        </div>
      )}

      {sheetPosition && (
        <ClosePositionSheet
          position={sheetPosition}
          onDismiss={() => setSheetPosition(null)}
          onRefetch={refetch}
        />
      )}
    </div>
  );
}

function PmEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-14 bg-white/[0.03] border border-white/[0.05] rounded-xl">
      <p className="text-xs text-white/25 text-center px-4">{label}</p>
    </div>
  );
}

function formatPriceBps(bps: number): string {
  // bps → dollars (1 share at 10_000 bps = $1.00).
  return `$${(bps / 10_000).toFixed(2)}`;
}

function PositionRow({ position: p, onTap }: { position: PmPosition; onTap: () => void }) {
  const isClosing = p.status === 'closing';
  const badgeLabel = (p.outcomeLabel || '').slice(0, 3).toUpperCase();

  const currentValueUsd = p.currentValueUsdcCents != null ? p.currentValueUsdcCents / 100 : null;
  const entryUsd = p.entryStakeUsdcCents / 100;
  const pnlUsd = currentValueUsd != null ? currentValueUsd - entryUsd : null;
  const pnlPct = pnlUsd != null && entryUsd > 0 ? (pnlUsd / entryUsd) * 100 : null;
  const pnlPositive = (pnlUsd ?? 0) >= 0;

  const inner = (
    <>
      <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] font-bold text-violet-400 tracking-tight">{badgeLabel}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white/90 truncate">{p.marketQuestion}</p>
        <p className="text-[10px] text-violet-400/70 mt-0.5">
          {p.sizeShares} shares · {formatPriceBps(p.entryPriceAvgBps)}
        </p>
      </div>
      <div className="text-right flex-shrink-0 flex flex-col gap-1 items-end">
        {currentValueUsd != null ? (
          <>
            <p className="text-xs text-white/70 font-mono">${currentValueUsd.toFixed(2)}</p>
            {pnlUsd != null && pnlPct != null && (
              <p className={`text-[10px] ${pnlPositive ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                {pnlPositive ? '+' : ''}${pnlUsd.toFixed(2)} ({pnlPositive ? '+' : ''}{pnlPct.toFixed(1)}%)
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-white/70 font-mono">${entryUsd.toFixed(2)}</p>
        )}
      </div>
    </>
  );

  if (isClosing) {
    return (
      <div
        aria-disabled
        className="relative flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3 opacity-60"
      >
        {inner}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#0f0f1a]/40 rounded-xl">
          <Spinner size="xs" />
          <p className="text-[10px] font-semibold text-white/70 uppercase tracking-widest">Closing…</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
    >
      {inner}
    </button>
  );
}
