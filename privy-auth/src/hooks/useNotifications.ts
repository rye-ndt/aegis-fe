import React from 'react';
import { useFetch } from './useFetch';
import { useAppConfig } from './useAppData';
import { createLogger } from '../utils/logger';

const log = createLogger('useNotifications');

export type NotificationItem = {
  id: string;
  senderHandle: string | null;
  senderDisplayName: string | null;
  tokenSymbol: string;
  amountFormatted: string;
  chainId: number;
  txHash: string | null;
  createdAtEpoch: number;
  status: 'pending' | 'delivered' | 'failed';
};

function parseItems(body: unknown): NotificationItem[] {
  const data = (body ?? {}) as Record<string, unknown>;
  return (data.items ?? []) as NotificationItem[];
}

export function useNotifications(limit = 20) {
  const { backendUrl, privyToken } = useAppConfig();
  const authHeaders = React.useMemo(
    () => ({ Authorization: `Bearer ${privyToken}` }),
    [privyToken],
  );
  const url =
    backendUrl && privyToken
      ? `${backendUrl}/notifications?kind=p2p_send&limit=${limit}`
      : null;

  const { data, loading, error } = useFetch<NotificationItem[]>(url, {
    headers: authHeaders,
    transform: parseItems,
    errorMessage: 'Could not load notifications',
  });

  React.useEffect(() => {
    if (data != null) {
      log.debug('← 200', { count: data.length });
    }
  }, [data]);

  return { items: data ?? [], loading, error };
}
