import React from 'react';
import { resilientFetch } from '../utils/resilientFetch';
import { createLogger } from '../utils/logger';

const log = createLogger('useFetch');

export function useFetch<T>(
  url: string | null,
  options: {
    headers?: Record<string, string>;
    transform?: (body: unknown) => T;
    errorMessage?: string;
    enabled?: boolean;
  } = {},
): { data: T | null; loading: boolean; error: string | null } {
  const { headers, transform, errorMessage = 'Request failed', enabled = true } = options;
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(!!url && enabled);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    log.debug('fetching', { url });

    resilientFetch(url, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<unknown>;
      })
      .then((body) => {
        if (cancelled) return;
        setData(transform ? transform(body) : (body as T));
      })
      .catch((err) => {
        if (!cancelled) {
          log.error(errorMessage, { url, err: err instanceof Error ? err.message : String(err) });
          setError(errorMessage);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled]);

  return { data, loading, error };
}
