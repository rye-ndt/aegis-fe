import React from 'react';
import type { MiniAppRequest } from '../types/miniAppRequest.types';
import { usePrivyToken } from './privy';
import { loggedFetch } from '../utils/loggedFetch';
import { createLogger } from '../utils/logger';

const log = createLogger('useRequest');

export function useRequest(backendUrl: string): {
  requestId: string | null;
  request: MiniAppRequest | null;
  loading: boolean;
  error: string | null;
} {
  const requestId = new URLSearchParams(window.location.search).get('requestId');
  const privyToken = usePrivyToken();
  const [request, setRequest] = React.useState<MiniAppRequest | null>(null);
  const [loading, setLoading] = React.useState(!!requestId);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!requestId || !backendUrl) {
      setLoading(false);
      return;
    }

    log.debug('fetching request', { requestId });

    const headers: Record<string, string> = {};
    if (privyToken) headers['Authorization'] = `Bearer ${privyToken}`;

    loggedFetch(`${backendUrl}/request/${requestId}`, { headers })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          const detail = await r.json().catch(() => null) as { error?: string } | null;
          const reason = detail?.error ?? (r.status === 401 ? 'unauthorized' : 'forbidden');
          log.warn('request-fetch-unauthorized', { requestId, status: r.status, reason });
          throw new Error(r.status === 401 ? 'Session expired — please reopen' : 'Not allowed to view this request');
        }
        if (r.status === 404) throw new Error('Request not found or expired');
        if (r.status === 410) throw new Error('Request expired');
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json() as Promise<MiniAppRequest>;
      })
      .then((data) => {
        log.info('request-received', { requestId: data.requestId, type: data.requestType });
        setRequest(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const isNetworkError = err instanceof TypeError;
        const msg = isNetworkError ? 'Could not reach server' : (err instanceof Error ? err.message : String(err));
        log.error('request-load-failed', { requestId, err: msg });
        setError(msg);
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { requestId, request, loading, error };
}
