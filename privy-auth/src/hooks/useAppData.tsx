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

type Resource<T> = { data: T | null; loading: boolean; error: string | null };

type AppData = {
  portfolio: Resource<PortfolioToken[]>;
  delegations: Resource<GrantPermission[]>;
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
    },
  );

  const value = React.useMemo<AppData>(
    () => ({ portfolio, delegations }),
    [
      portfolio.data,
      portfolio.loading,
      portfolio.error,
      delegations.data,
      delegations.loading,
      delegations.error,
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
