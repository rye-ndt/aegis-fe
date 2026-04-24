import type { MiniAppRequest } from '../types/miniAppRequest.types';
import { resilientFetch } from './resilientFetch';

const NEXT_REQUEST_MAX_ATTEMPTS = 6;
const NEXT_REQUEST_RETRY_DELAY_MS = 400;

/**
 * Fetch the next queued mini-app request for the authenticated user after
 * resolving `afterRequestId`. Used by SignHandler to chain multi-step
 * swaps without closing the WebApp window between steps.
 *
 * The backend creates the next step ~500ms after the FE posts its SignResponse
 * (the capability's waitFor poll has to tick first), so we retry with
 * fixed-interval backoff before treating the queue as empty.
 *
 * Two retry loops with distinct jobs:
 * - resilientFetch inner loop: handle 429/5xx/network errors.
 * - Outer 404 loop: wait for the backend to finish creating the next request.
 */
export async function fetchNextRequest(
  backendUrl: string,
  afterRequestId: string,
  privyToken: string,
): Promise<MiniAppRequest | null> {
  const url = `${backendUrl}/request/${afterRequestId}?after=${afterRequestId}`;
  for (let attempt = 0; attempt < NEXT_REQUEST_MAX_ATTEMPTS; attempt++) {
    const r = await resilientFetch(url, {
      headers: { Authorization: `Bearer ${privyToken}` },
    });
    if (r.status === 404) {
      if (attempt < NEXT_REQUEST_MAX_ATTEMPTS - 1) {
        await sleep(NEXT_REQUEST_RETRY_DELAY_MS);
        continue;
      }
      return null;
    }
    if (r.status === 410) return null;
    if (!r.ok) throw new Error(`Server error: ${r.status}`);
    return r.json() as Promise<MiniAppRequest>;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
