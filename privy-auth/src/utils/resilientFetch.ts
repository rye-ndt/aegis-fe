import { loggedFetch } from './loggedFetch';
import { createLogger } from './logger';

const log = createLogger('resilientFetch');

export interface ResilientFetchOptions extends RequestInit {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** HTTP statuses that should trigger a retry. */
  retryStatuses?: readonly number[];
}

const DEFAULT_RETRY_STATUSES: readonly number[] = [429, 502, 503, 504];
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 2_000;

function jitter(ms: number): number {
  return Math.floor(ms * (0.5 + Math.random() * 0.5));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wraps loggedFetch with bounded exponential backoff on retryable statuses
 * (default 429/502/503/504) and on network errors. Non-retryable responses
 * are returned unchanged (the caller decides what to do with 400/401/404/410).
 *
 * Retry-After header is honored when present on 429/503.
 */
export async function resilientFetch(
  url: string,
  init: ResilientFetchOptions = {},
): Promise<Response> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    ...fetchInit
  } = init;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await loggedFetch(url, fetchInit);
      if (!retryStatuses.includes(response.status)) return response;

      // Retryable status.
      const retryAfter = response.headers.get('retry-after');
      const explicitDelay = retryAfter ? Number(retryAfter) * 1000 : null;
      const delay =
        explicitDelay && !Number.isNaN(explicitDelay)
          ? Math.min(explicitDelay, maxDelayMs)
          : Math.min(jitter(baseDelayMs * 2 ** attempt), maxDelayMs);

      if (attempt >= maxAttempts - 1) {
        log.warn('retries exhausted', { attempts: maxAttempts, lastStatus: response.status });
        return response;
      }
      log.debug(`retry ${attempt + 1}/${maxAttempts} in ${delay}ms`, { attempt, status: response.status, willRetry: true });
      await sleep(delay);
    } catch (err) {
      // Network error — retry unless we're at the last attempt.
      lastErr = err;
      if (attempt >= maxAttempts - 1) {
        log.warn('retries exhausted (network error)', { attempts: maxAttempts });
        throw err;
      }
      const delay = Math.min(jitter(baseDelayMs * 2 ** attempt), maxDelayMs);
      log.debug(`retry ${attempt + 1}/${maxAttempts} in ${delay}ms (network error)`, { attempt, willRetry: true });
      await sleep(delay);
    }
  }
  // Unreachable — loop always returns or throws.
  throw lastErr ?? new Error('resilientFetch: exhausted retries');
}
