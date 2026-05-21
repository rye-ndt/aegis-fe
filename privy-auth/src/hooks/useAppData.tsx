import React from 'react';
import { useFetch } from './useFetch';

export type PortfolioToken = {
  symbol?: string;
  name?: string;
  balance?: string | number;
  usdValue?: string | number | null;
};

export type GrantPermission = {
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  limitRaw?: string;
  spentRaw?: string;
  validUntil?: number;
};

export type YieldPosition = {
  protocolId: string;
  protocolName: string;
  chainId: number;
  tokenSymbol: string;
  principalHuman: string;
  currentValueHuman: string;
  pnlHuman: string;
  pnl24hHuman: string;
  apy: number;
};

export type YieldPositionsData = {
  positions: YieldPosition[];
  totals: {
    principalHuman: string;
    currentValueHuman: string;
    pnlHuman: string;
  };
};

export type UserProfile = {
  pendingFlushed: number;
};

export type PmPositionStatus = 'open' | 'closing' | 'closed' | 'resolved';

export type PmPosition = {
  id: string;
  marketId: string;
  outcomeTokenId: string;
  side: string;
  marketQuestion: string;
  outcomeLabel: string;
  sizeShares: string;
  entryPriceAvgBps: number;
  entryStakeUsdcCents: number;
  currentValueUsdcCents: number | null;
  status: PmPositionStatus;
  openedAtEpoch: number;
};

export type PmPositionsData = { positions: PmPosition[] };

type Resource<T> = { data: T | null; loading: boolean; error: string | null; refetch: () => void };

type AppData = {
  portfolio: Resource<PortfolioToken[]>;
  delegations: Resource<GrantPermission[]>;
  yieldPositions: Resource<YieldPositionsData>;
  pmPositions: Resource<PmPositionsData>;
  userProfile: Resource<UserProfile>;
  backendUrl: string;
  privyToken: string;
};

function parsePortfolio(body: unknown): PortfolioToken[] {
  const data = (body ?? {}) as Record<string, unknown>;
  const raw = (data.tokens ?? data.balances ?? data.items ?? []) as PortfolioToken[];
  return [...raw]
    .sort(
      (a, b) =>
        (parseFloat(String(b.usdValue ?? 0)) || 0) -
        (parseFloat(String(a.usdValue ?? 0)) || 0),
    )
    .slice(0, 10);
}

function parseGrants(body: unknown): GrantPermission[] {
  const data = (body ?? {}) as Record<string, unknown>;
  return (data.grants ??
    data.delegations ??
    data.permissions ??
    data.items ??
    (Array.isArray(body) ? body : [])) as GrantPermission[];
}

function parseUserProfile(body: unknown): UserProfile {
  const data = (body ?? {}) as Record<string, unknown>;
  return { pendingFlushed: typeof data.pendingFlushed === 'number' ? data.pendingFlushed : 0 };
}

export function parsePmPositions(body: unknown): PmPositionsData {
  // BE ships the new shape ({ positions: PositionListItem[] }) in the paired
  // deploy. Tolerate `null`/missing fields without throwing, but do not carry a
  // permanent dual-shape branch — the parser stays narrow on purpose.
  const data = (body ?? {}) as Record<string, unknown>;
  const positions = Array.isArray(data.positions) ? (data.positions as PmPosition[]) : [];
  return { positions };
}

function parseYieldPositions(body: unknown): YieldPositionsData {
  const data = (body ?? {}) as Record<string, unknown>;
  const positions = (data.positions ?? []) as YieldPosition[];
  const totals = (data.totals ?? {
    principalHuman: '0.00',
    currentValueHuman: '0.00',
    pnlHuman: '+0.00',
  }) as YieldPositionsData['totals'];
  return { positions, totals };
}

const AppDataContext = React.createContext<AppData | null>(null);

export function AppDataProvider({
  backendUrl,
  privyToken,
  children,
}: {
  backendUrl: string;
  privyToken: string;
  children: React.ReactNode;
}) {
  const authHeaders = React.useMemo(
    () => ({ Authorization: `Bearer ${privyToken}` }),
    [privyToken],
  );

  const portfolio = useFetch<PortfolioToken[]>(
    privyToken && backendUrl ? `${backendUrl}/portfolio` : null,
    {
      headers: authHeaders,
      transform: parsePortfolio,
      errorMessage: 'Could not load balance',
    },
  );

  const delegations = useFetch<GrantPermission[]>(
    privyToken && backendUrl ? `${backendUrl}/delegation/grant` : null,
    {
      headers: authHeaders,
      transform: parseGrants,
      errorMessage: 'Could not load permissions',
      // Bar reflects spent_raw which only changes after autosigned txs resolve
      // server-side. Re-pull whenever the mini app regains focus so the user
      // sees fresh values without a full remount.
      refetchOnVisible: true,
    },
  );

  const yieldPositions = useFetch<YieldPositionsData>(
    privyToken && backendUrl ? `${backendUrl}/yield/positions` : null,
    {
      headers: authHeaders,
      transform: parseYieldPositions,
      errorMessage: 'Could not load yield positions',
    },
  );

  const pmPositions = useFetch<PmPositionsData>(
    privyToken && backendUrl ? `${backendUrl}/predictionMarket/positions` : null,
    {
      headers: authHeaders,
      transform: parsePmPositions,
      errorMessage: 'Could not load prediction positions',
      // Mirror delegations: row state changes server-side after SignHandler
      // finishes (open → closing → gone). Re-pull on visibility to drop stale
      // 'closing' rows when the user reopens the mini-app.
      refetchOnVisible: true,
    },
  );

  const userProfile = useFetch<UserProfile>(
    privyToken && backendUrl ? `${backendUrl}/user/profile` : null,
    {
      headers: authHeaders,
      transform: parseUserProfile,
      errorMessage: 'Could not load profile',
    },
  );

  const value = React.useMemo<AppData>(
    () => ({ portfolio, delegations, yieldPositions, pmPositions, userProfile, backendUrl, privyToken }),
    [
      portfolio.data,
      portfolio.loading,
      portfolio.error,
      delegations.data,
      delegations.loading,
      delegations.error,
      yieldPositions.data,
      yieldPositions.loading,
      yieldPositions.error,
      pmPositions.data,
      pmPositions.loading,
      pmPositions.error,
      userProfile.data,
      userProfile.loading,
      userProfile.error,
      backendUrl,
      privyToken,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function useAppData(): AppData {
  const ctx = React.useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>');
  return ctx;
}

export const usePortfolio = () => useAppData().portfolio;
export const useDelegations = () => useAppData().delegations;
export const useYieldPositions = () => useAppData().yieldPositions;
export const usePmPositions = () => useAppData().pmPositions;
export const useUserProfile = () => useAppData().userProfile;
export const useAppConfig = () => {
  const { backendUrl, privyToken } = useAppData();
  return { backendUrl, privyToken };
};
