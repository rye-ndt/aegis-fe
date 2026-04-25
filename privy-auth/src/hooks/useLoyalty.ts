import React from 'react';
import { resilientFetch } from '../utils/resilientFetch';
import { createLogger } from '../utils/logger';
import { useAppConfig } from './useAppData';

const log = createLogger('useLoyalty');

export type LedgerEntry = {
  actionType: string;
  points: string;
  createdAtEpoch: number;
};

export type BalanceData = { seasonId: string; pointsTotal: string; rank: number | null };
export type LeaderboardData = {
  seasonId: string;
  entries: { rank: number; pointsTotal: string }[];
};

type GetState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
  refetch: () => void;
};

function useResilientGet<T>(opts: {
  url: string | null;
  headers?: Record<string, string>;
  parse: (body: unknown) => T;
  errorMessage: string;
  refetchOnVisible?: boolean;
}): GetState<T> {
  const { url, headers, parse, errorMessage, refetchOnVisible = false } = opts;
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(!!url);
  const [error, setError] = React.useState<string | null>(null);
  const [unauthorized, setUnauthorized] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  const refetch = React.useCallback(() => setTick((n) => n + 1), []);

  React.useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    resilientFetch(url, headers ? { headers } : undefined)
      .then(async (r) => {
        if (r.status === 401) {
          if (!cancelled) setUnauthorized(true);
          throw new Error('unauthorized');
        }
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as unknown;
      })
      .then((body) => {
        if (cancelled) return;
        setData(parse(body));
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.error(errorMessage, { url, err: msg });
        setError(errorMessage);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [url, headers, parse, errorMessage, tick]);

  React.useEffect(() => {
    if (!refetchOnVisible) return;
    const handler = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [refetchOnVisible, refetch]);

  return { data, loading, error, unauthorized, refetch };
}

function parseBalance(body: unknown): BalanceData {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    seasonId: String(b.seasonId ?? ''),
    pointsTotal: String(b.pointsTotal ?? '0'),
    rank: b.rank != null ? Number(b.rank) : null,
  };
}

function parseLeaderboard(body: unknown): LeaderboardData {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawEntries = (b.entries ?? []) as Array<Record<string, unknown>>;
  return {
    seasonId: String(b.seasonId ?? ''),
    entries: rawEntries.map((e) => ({
      rank: Number(e.rank ?? 0),
      pointsTotal: String(e.pointsTotal ?? '0'),
    })),
  };
}

function parseLedgerEntries(body: unknown): { entries: LedgerEntry[]; nextCursor: number | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = (b.entries ?? []) as Array<Record<string, unknown>>;
  const entries: LedgerEntry[] = raw.map((e) => ({
    actionType: String(e.actionType ?? ''),
    points: String(e.points ?? '0'),
    createdAtEpoch: Number(e.createdAtEpoch ?? 0),
  }));
  const nextCursor = b.nextCursor != null ? Number(b.nextCursor) : null;
  return { entries, nextCursor };
}

export function useLoyaltyBalance(): GetState<BalanceData> {
  const { backendUrl, privyToken } = useAppConfig();
  const url = backendUrl && privyToken ? `${backendUrl}/loyalty/balance` : null;
  const headers = React.useMemo(
    () => (privyToken ? { Authorization: `Bearer ${privyToken}` } : undefined),
    [privyToken],
  );
  return useResilientGet<BalanceData>({
    url,
    headers,
    parse: parseBalance,
    errorMessage: "Couldn't load points",
    refetchOnVisible: true,
  });
}

export function useLoyaltyLeaderboard(limit = 10): GetState<LeaderboardData> {
  const { backendUrl } = useAppConfig();
  const url = backendUrl
    ? `${backendUrl}/loyalty/leaderboard?limit=${encodeURIComponent(String(limit))}`
    : null;
  return useResilientGet<LeaderboardData>({
    url,
    parse: parseLeaderboard,
    errorMessage: "Couldn't load leaderboard",
  });
}

export function useLoyaltyHistory(limit = 20): {
  data: LedgerEntry[] | null;
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
  hasMore: boolean;
  loadMore: () => void;
} {
  const { backendUrl, privyToken } = useAppConfig();
  const [entries, setEntries] = React.useState<LedgerEntry[] | null>(null);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [unauthorized, setUnauthorized] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [resetTick, setResetTick] = React.useState(0);
  const cursorRef = React.useRef<number | null>(null);
  React.useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  React.useEffect(() => {
    if (!backendUrl || !privyToken) return;
    let cancelled = false;
    setLoading(true);
    if (page === 0) {
      setError(null);
      setUnauthorized(false);
    }

    const url = new URL(`${backendUrl}/loyalty/history`);
    url.searchParams.set('limit', String(limit));
    if (page > 0 && cursorRef.current != null) {
      url.searchParams.set('cursorCreatedAtEpoch', String(cursorRef.current));
    }

    resilientFetch(url.toString(), {
      headers: { Authorization: `Bearer ${privyToken}` },
    })
      .then(async (r) => {
        if (r.status === 401) {
          if (!cancelled) setUnauthorized(true);
          throw new Error('unauthorized');
        }
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as unknown;
      })
      .then((body) => {
        if (cancelled) return;
        const { entries: newEntries, nextCursor } = parseLedgerEntries(body);
        setEntries((prev) => (page === 0 ? newEntries : [...(prev ?? []), ...newEntries]));
        setCursor(nextCursor);
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Couldn't load history", { err: err instanceof Error ? err.message : String(err) });
        setError("Couldn't load points");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [backendUrl, privyToken, limit, page, resetTick]);

  const loadMore = React.useCallback(() => {
    if (cursor != null) setPage((n) => n + 1);
  }, [cursor]);

  React.useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      setEntries(null);
      setCursor(null);
      setPage(0);
      setResetTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return {
    data: entries,
    loading,
    error,
    unauthorized,
    hasMore: cursor != null,
    loadMore,
  };
}
