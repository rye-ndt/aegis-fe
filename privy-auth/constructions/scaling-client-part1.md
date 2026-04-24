# Mini-App Scaling — Part 1: Resilient retry on 429 / 5xx

> Prerequisite: none.
> Behavior change: **none on happy path.** On backend throttling or transient 5xx, the client now retries with bounded backoff instead of surfacing a hard error.
> Expected impact: near-zero user-visible failures when backend replicas recycle or OpenAI queues are saturated.

## Why

Four FE fetch call sites, each with a different failure posture:

| File | Line | Current failure behavior |
| --- | --- | --- |
| `src/utils/loggedFetch.ts` | 10 | Raw `fetch` passthrough; no retry |
| `src/utils/fetchNextRequest.ts` | 22–36 | Retries only on 404 (pending not yet created). Treats 429/5xx as fatal |
| `src/utils/postResponse.ts` | 5–14 | Throws on any non-2xx |
| `src/hooks/useFetch.ts` | 23–33 | No retry, any non-2xx becomes `error` |

Once the backend is multi-replica:

- A 502/504 during Cloud Run instance recycle is recoverable: the next request lands on a healthy replica.
- A 429 (added by backend if the OpenAI queue overflows — see BE Phase 3 Part 3 decision thresholds) is recoverable after a short sleep.
- A 401/404/410 remains fatal (same as today).

The fix is a single helper that wraps `fetch` with class-based retry logic, used everywhere.

## Step 1.1 — Introduce `resilientFetch`

New file `src/utils/resilientFetch.ts`:

```ts
import { loggedFetch } from './loggedFetch';

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
        // Out of retries — return the last response for the caller to handle.
        return response;
      }
      console.warn(`[API] retry ${attempt + 1}/${maxAttempts} in ${delay}ms (status=${response.status})`);
      await sleep(delay);
    } catch (err) {
      // Network error — retry unless we're at the last attempt.
      lastErr = err;
      if (attempt >= maxAttempts - 1) throw err;
      const delay = Math.min(jitter(baseDelayMs * 2 ** attempt), maxDelayMs);
      console.warn(`[API] retry ${attempt + 1}/${maxAttempts} in ${delay}ms (network error)`);
      await sleep(delay);
    }
  }
  // Unreachable — loop always returns or throws.
  throw lastErr ?? new Error('resilientFetch: exhausted retries');
}
```

Keep `loggedFetch.ts` untouched — `resilientFetch` composes on top of it, so request/response logging still happens per attempt.

## Step 1.2 — Swap callers over

### 1.2.1 — `postResponse.ts`

Replace the whole file:

```ts
import type { MiniAppResponse } from '../types/miniAppRequest.types';
import { resilientFetch } from './resilientFetch';

export async function postResponse(backendUrl: string, response: MiniAppResponse): Promise<unknown> {
  const r = await resilientFetch(`${backendUrl}/response`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${response.privyToken}`,
    },
    body: JSON.stringify(response),
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
```

### 1.2.2 — `fetchNextRequest.ts`

The existing `MAX_ATTEMPTS = 6 / RETRY_DELAY_MS = 400` exists for a **different** reason (waiting for the backend to create the next pending after a sign response, not retrying on failure). Keep that loop, but wrap each attempt in `resilientFetch` so transient 5xx inside each attempt also retries. Updated file:

```ts
import type { MiniAppRequest } from '../types/miniAppRequest.types';
import { resilientFetch } from './resilientFetch';

const NEXT_REQUEST_MAX_ATTEMPTS = 6;
const NEXT_REQUEST_RETRY_DELAY_MS = 400;

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
```

The two retry loops have different jobs:
- `resilientFetch`'s loop: handle 429/5xx/network.
- Outer 404 loop: wait for the backend to finish creating the next mini-app request.

Keeping them separate keeps the semantics clean.

### 1.2.3 — `useFetch.ts`

Swap `fetch` for `resilientFetch`:

```ts
import React from 'react';
import { resilientFetch } from '../utils/resilientFetch';

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

    resilientFetch(url, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<unknown>;
      })
      .then((body) => {
        if (cancelled) return;
        setData(transform ? transform(body) : (body as T));
      })
      .catch(() => {
        if (!cancelled) setError(errorMessage);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled]);

  return { data, loading, error };
}
```

## Step 1.3 — User-visible "backend busy" surface (optional but cheap)

If the retry exhausts (the response is still 429/503 after the final attempt), the user sees the existing generic error. Add a one-line branch so they see something recoverable-sounding:

Edit `src/utils/toErrorMessage.ts` (or wherever error messages are centralized). Add:

```ts
if (typeof err === 'string' && /^(429|503)$/.test(err)) {
  return 'Service is busy. Try again in a moment.';
}
if (err instanceof Error && /^(429|503)$/.test(err.message)) {
  return 'Service is busy. Try again in a moment.';
}
```

Skip this step if the existing error text is already generic enough ("Request failed" / "Server error"). It's polish, not correctness.

## How to verify locally

1. `npm run dev` in `fe/privy-auth/`.
2. Point at backend with a deliberate throttling hook — easiest: temporarily throw 503 on every 3rd request in `src/adapters/implementations/input/http/httpServer.ts` behind an env flag. Or use `toxiproxy`:
   ```
   docker run --rm -p 8474:8474 -p 8000:8000 shopify/toxiproxy
   # then create a proxy to the real BE and inject "status_code 503" toxic
   ```
3. Drive portfolio/sign flows in the mini-app. Console should show `[API] retry 1/4 …`, then success.
4. Force > 4 consecutive 503s → `postResponse` / `useFetch` surface the polished error message.
5. Verify the happy path is unchanged by disabling the toxic → behavior is identical to pre-change.
6. `npm run lint` / `npm run build` — clean.

## Rollback

Per-file revert. `resilientFetch.ts` can remain as dead code.

## Acceptance

- 429/502/503/504 are retried up to 4 times with jittered backoff.
- `Retry-After` header honored when present.
- 401/404/410 remain fatal (not retried).
- No change to the request body/headers of any call site.
- Build clean, lint clean.

## Record in status.md

```
- 2026-04-24 — All FE fetch helpers now route through `resilientFetch` (429/5xx
  jittered backoff, Retry-After aware, max 4 attempts). `loggedFetch` stays as
  the raw request logger. Long-poll loops in `fetchNextRequest` kept separate —
  one handles "waiting for backend to create pending" (404), the other handles
  transport errors. Do not collapse them.
```
