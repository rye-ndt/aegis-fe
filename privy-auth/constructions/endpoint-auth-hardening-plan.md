# Endpoint Auth Hardening — FE Plan

## Why
The BE is closing four currently-unauthenticated endpoints (see `be/constructions/endpoint-auth-hardening-plan.md`). The only one the mini-app calls is `GET /request/:requestId` — today it's fetched without an `Authorization` header. After the BE change, sign/approve requests will 401 unless we attach the Privy token. The `auth` request type will keep working unauthenticated (chicken-and-egg — the user has no token yet).

## Scope
- One file: `src/hooks/useRequest.ts`.
- One change: attach `Authorization: Bearer ${privyToken}` when available.
- No type changes, no new hooks, no API change for callers.

## Change

### `useRequest.ts`
Currently fetches `${backendUrl}/request/${requestId}` with no auth header. Pull the token from the existing `usePrivyToken()` hook (already used elsewhere in the app) and attach it when present.

```ts
const { token: privyToken } = usePrivyToken();
// inside the fetch:
const headers: Record<string, string> = {};
if (privyToken) headers["Authorization"] = `Bearer ${privyToken}`;
const r = await loggedFetch(`${backendUrl}/request/${requestId}`, { headers });
```

Why "when available, not required":
- The very first hit for an `auth` request happens before login. `privyToken` is `null` then — that's expected; BE allows unauthenticated reads of `auth` requests.
- All sign/approve requests come after auth, so the token will be present.
- This keeps the hook's contract identical and avoids a load-order race between `useRequest` mounting and `usePrivyToken` resolving.

### `fetchNextRequest.ts`
Already passes `privyToken` as `Authorization: Bearer` per `status.md`. No change needed — verify during implementation.

## Logging
Per `status.md` logging convention:
- On 401 / 403, surface via `log.warn` so it raises a sonner toast (the user sees "session expired" rather than a silent stall).
- On non-401 errors, keep current behavior.

```ts
if (r.status === 401 || r.status === 403) {
  log.warn('request-fetch-unauthorized', { requestId, status: r.status });
}
```

Never log the token. `requestId` + `status` only.

## Testing (manual, no test runner exists)
1. **Auth bootstrap** — open a fresh TMA session with `?requestId=<auth-id>`. Should still load (no token sent, BE allows).
2. **Sign request, logged in** — open with `?requestId=<sign-id>` while authenticated. Should load; check Network tab for the Bearer header.
3. **Sign request, wrong user** — manually craft a URL with another user's `requestId`. Should 403 with a sonner toast.
4. **Token expired** — let the Privy token rot or clear it; reopen a sign request. Should 401 with toast; user re-auths.

## Rollout
Atomic with BE (single coordinated deploy). If BE ships first without this FE change, the mini-app will 401 on sign/approve and users will be stuck. If FE ships first without BE, behavior is unchanged (BE just ignores the new header).

Safe order if not atomic: **FE first, then BE.** FE-first is a no-op on today's BE; BE-first breaks the mini-app.

## Out of scope
- No changes to `useFetch` (already authed).
- No changes to `postResponse` (already authed).
- No changes to `useAppData` selectors (already authed via context).
- No changes to `useLoyalty` (already authed for balance/history; leaderboard intentionally public).

## status.md updates after merge
- "Backend HTTP Endpoints" table: note that `GET /request/:requestId` requires Privy except for `requestType === 'auth'`.
- Add a feature-log entry under 2026-04-25.

## Open questions before implementation
1. Confirm BE ship order — atomic preferred. If not atomic, FE-first is safe.
2. Should an unauthorized error on `useRequest` automatically trigger a Privy re-login flow, or just toast and let the user retry? (Default: toast only — re-login UX should be a separate task.)
