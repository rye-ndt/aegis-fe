import React from 'react';
import type { MiniAppRequest } from '../types/miniAppRequest.types';
import { loggedFetch } from '../utils/loggedFetch';

export function useRequest(backendUrl: string): {
  requestId: string | null;
  request: MiniAppRequest | null;
  loading: boolean;
  error: string | null;
} {
  const requestId = new URLSearchParams(window.location.search).get('requestId');
  const [request, setRequest] = React.useState<MiniAppRequest | null>(null);
  const [loading, setLoading] = React.useState(!!requestId);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!requestId || !backendUrl) {
      setLoading(false);
      return;
    }

    loggedFetch(`${backendUrl}/request/${requestId}`)
      .then((r) => {
        if (r.status === 404) throw new Error('Request not found or expired');
        if (r.status === 410) throw new Error('Request expired');
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json() as Promise<MiniAppRequest>;
      })
      .then((data) => {
        setRequest(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const isNetworkError = err instanceof TypeError;
        setError(isNetworkError ? 'Could not reach server' : (err instanceof Error ? err.message : String(err)));
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { requestId, request, loading, error };
}
