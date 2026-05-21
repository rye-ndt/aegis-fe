import React from 'react';
import type { PmPosition } from '../hooks/useAppData';
import { useAppConfig } from '../hooks/useAppData';
import { loggedFetch } from '../utils/loggedFetch';
import { createLogger } from '../utils/logger';
import { BottomSheet } from './atomics/BottomSheet';
import { Spinner } from './atomics/spinner';
import { persistTabAfterSign } from './StatusView';
import { toast } from 'sonner';

const log = createLogger('closePositionSheet');

type Preview = {
  bestBidPriceBps: number;
  estProceedsUsdcCents: number;
  estPnlUsdcCents: number;
};

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'loaded'; preview: Preview }
  | { kind: 'gone' }
  | { kind: 'error'; message: string };

export function ClosePositionSheet({
  position,
  onDismiss,
  onRefetch,
}: {
  position: PmPosition;
  onDismiss: () => void;
  onRefetch: () => void;
}) {
  const { backendUrl, privyToken } = useAppConfig();
  const [state, setState] = React.useState<PreviewState>({ kind: 'loading' });
  const [submitting, setSubmitting] = React.useState(false);
  const submittingRef = React.useRef(false);

  React.useEffect(() => {
    log.info('step', { step: 'started', positionId: position.id });
    let cancelled = false;

    (async () => {
      try {
        const r = await loggedFetch(
          `${backendUrl}/predictionMarket/positions/${position.id}/previewClose`,
          { headers: { Authorization: `Bearer ${privyToken}` } },
        );
        if (cancelled) return;
        if (r.status === 404) {
          setState({ kind: 'gone' });
          return;
        }
        if (!r.ok) {
          const msg = `Preview failed (${r.status})`;
          log.error('preview-failed', { positionId: position.id, status: r.status }, { toast: false });
          setState({ kind: 'error', message: msg });
          return;
        }
        const body = (await r.json()) as Preview;
        log.debug('preview-fetched', {
          positionId: position.id,
          estProceedsUsdcCents: body.estProceedsUsdcCents,
        });
        setState({ kind: 'loaded', preview: body });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        log.error('preview-fetch-failed', { positionId: position.id, err: msg }, { toast: false });
        setState({ kind: 'error', message: 'Could not load preview' });
      }
    })();

    return () => { cancelled = true; };
  }, [backendUrl, privyToken, position.id]);

  const onClose = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    log.info('step', { step: 'submitted', positionId: position.id });

    try {
      const r = await loggedFetch(
        `${backendUrl}/predictionMarket/positions/${position.id}/close`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${privyToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const body = (await r.json().catch(() => ({}))) as {
        enqueuedRequestId?: string | null;
        code?: string;
        error?: string;
      };

      if (r.ok) {
        const enqueuedRequestId = body.enqueuedRequestId ?? null;
        log.info('step', {
          step: 'succeeded',
          positionId: position.id,
          enqueuedRequestId: enqueuedRequestId ?? 'null',
        });
        if (typeof enqueuedRequestId === 'string' && enqueuedRequestId.length > 0) {
          try {
            persistTabAfterSign('home');
            const path = window.location.pathname;
            window.location.assign(`${path}?requestId=${encodeURIComponent(enqueuedRequestId)}`);
          } catch (err) {
            const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            log.error('navigate-failed', { positionId: position.id, err: msg });
          }
          return;
        }
        toast.info('Close queued. Reopen the mini-app shortly.');
        onRefetch();
        onDismiss();
        return;
      }

      const code = body.code ?? '';
      log.warn('close-conflict', { positionId: position.id, code, status: r.status }, { toast: false });

      if (r.status === 409 && code === 'BET_IN_FLIGHT') {
        toast.warning('Another bet is being placed. Try again in a moment.');
      } else if (r.status === 409 && code === 'POSITION_WRONG_STATUS') {
        toast.warning('Position state changed. Refreshing.');
        onRefetch();
        onDismiss();
      } else if (r.status === 404 || code === 'POSITION_NOT_OPEN' || code === 'POSITION_NOT_FOUND') {
        toast.info('That position is no longer open.');
        onRefetch();
        onDismiss();
      } else {
        const msg = body.error ?? `Close failed (${r.status})`;
        log.error('close-failed', { positionId: position.id, status: r.status, err: msg });
      }
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      log.error('close-failed', { positionId: position.id, err: msg });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet open={true} onDismiss={submitting ? () => {} : onDismiss} ariaLabel="Close prediction position">
      <div className="flex flex-col gap-4">
        <Header position={position} />

        {state.kind === 'loading' && (
          <div className="flex items-center justify-center py-8 gap-2">
            <Spinner size="sm" />
            <p className="text-xs text-white/40">Loading quote…</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-xs text-red-400/90">{state.message}</p>
          </div>
        )}

        {state.kind === 'gone' && (
          <>
            <div className="bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3">
              <p className="text-xs text-white/70">That position is no longer open.</p>
            </div>
            <button
              type="button"
              onClick={() => { onRefetch(); onDismiss(); }}
              className="w-full rounded-xl bg-white/[0.06] border border-white/[0.08] py-3 text-xs font-semibold text-white/80 hover:bg-white/[0.09]"
            >
              Dismiss
            </button>
          </>
        )}

        {state.kind === 'loaded' && (
          <PreviewRows position={position} preview={state.preview} />
        )}

        {state.kind === 'loaded' && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full rounded-xl bg-violet-500/90 hover:bg-violet-500 disabled:bg-violet-500/40 disabled:cursor-not-allowed py-3 text-xs font-bold text-white tracking-wide flex items-center justify-center gap-2"
            >
              {submitting && <Spinner size="xs" className="border-white/30 border-t-white" />}
              {submitting ? 'Closing…' : 'Close position'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={submitting}
              className="w-full rounded-xl bg-transparent border border-white/[0.08] py-3 text-xs font-semibold text-white/70 hover:bg-white/[0.04] disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Header({ position: p }: { position: PmPosition }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/15 rounded px-1.5 py-0.5 tracking-wide">
          {(p.outcomeLabel || '').slice(0, 3).toUpperCase()}
        </span>
        <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Close position</p>
      </div>
      <p className="text-sm font-semibold text-white/90 leading-snug">{p.marketQuestion}</p>
    </div>
  );
}

function PreviewRows({ position, preview }: { position: PmPosition; preview: Preview }) {
  const entryUsd = position.entryStakeUsdcCents / 100;
  const proceedsUsd = preview.estProceedsUsdcCents / 100;
  const pnlUsd = preview.estPnlUsdcCents / 100;
  const pnlPositive = pnlUsd >= 0;
  const pnlPct = entryUsd > 0 ? (pnlUsd / entryUsd) * 100 : 0;
  const bidUsd = preview.bestBidPriceBps / 10_000;

  return (
    <div className="flex flex-col gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
      <Row label="Size" value={`${position.sizeShares} shares`} />
      <Row label="Quote (bid)" value={`$${bidUsd.toFixed(3)}`} />
      <Row label="Est. proceeds" value={`$${proceedsUsd.toFixed(2)}`} variant="emphasis" />
      <Row label="Entry stake" value={`$${entryUsd.toFixed(2)}`} />
      <Row
        label="Est. PnL"
        value={`${pnlPositive ? '+' : ''}$${pnlUsd.toFixed(2)} (${pnlPositive ? '+' : ''}${pnlPct.toFixed(1)}%)`}
        variant={pnlPositive ? 'positive' : 'negative'}
      />
    </div>
  );
}

type RowVariant = 'default' | 'emphasis' | 'positive' | 'negative';

const ROW_VALUE_CLASS: Record<RowVariant, string> = {
  default: 'text-white/80',
  emphasis: 'text-white font-semibold',
  positive: 'text-emerald-400',
  negative: 'text-red-400',
};

function Row({ label, value, variant = 'default' }: { label: string; value: string; variant?: RowVariant }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px] text-white/40">{label}</p>
      <p className={`text-xs font-mono ${ROW_VALUE_CLASS[variant]}`}>{value}</p>
    </div>
  );
}
