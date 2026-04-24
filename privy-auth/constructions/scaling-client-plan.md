# Mini-App Scaling Plan (Client Side)

> Authored: 2026-04-24
> Scope: `fe/privy-auth/` — the Telegram WebApp mini-app that pairs with the backend at 200 concurrent users.
> Paired with: `be/constructions/scaling-plan.md`.
> **Non-goal: no UX change.** Every step preserves behavior; differences only show under adverse conditions (backend throttling, replica failover).

## Context

The backend migrates from a single combined process to Cloud Run multi-replica
(`aegis-worker` + N × `aegis-api`). On the happy path, the mini-app sees
nothing different. The two failure modes it needs to tolerate gracefully:

1. **Backend throttling.** Phase 1 Part 2 introduces an OpenAI concurrency cap per replica. Under burst, user-visible latency rises; the backend may also return `429` if in-process queues overflow (not yet — but cheap insurance to wire).
2. **Replica failover.** An in-flight request can get dropped mid-flight when Cloud Run recycles an instance. The FE currently treats any 5xx as a hard failure.

Nothing in the current FE assumes sticky routing to a single backend replica (verified in part 2); all state is server-authoritative via Postgres/Redis. So the client-side plan is small: harden the two fetch helpers and the one polling helper.

## What the backend guarantees (from the BE plan)

- Every authenticated request validates via Privy token; no session-on-client assumptions.
- Multi-step flows (`/send`, `/swap`) persist via `pending_collection:{channelId}` in Redis — surviving replica hops.
- `miniAppRequest` and `signingRequest` caches are already Redis-backed (pre-existing — verify in `be/src/adapters/implementations/output/cache/redis.miniAppRequest.ts`).
- Polling endpoint `/request/:id` is idempotent and safe to retry.

## Parts index

- [scaling-client-part1.md](scaling-client-part1.md) — Resilient retry: 429/5xx backoff in `loggedFetch`, `fetchNextRequest`, `postResponse`, `useFetch`.
- [scaling-client-part2.md](scaling-client-part2.md) — Stateless-routing audit: confirm nothing in FE assumes sticky sessions; add a regression test.

## Order of operations

1. Part 1 (resilience) — merge before backend part 4 (multi-replica) flips.
2. Part 2 (audit) — can ship anytime; it's mostly verification with minimal code.

## Local dev

The existing `npm run dev` keeps working. To exercise multi-replica behavior locally, point the FE at the BE's nginx load balancer:

```
# fe/privy-auth/.env.local
VITE_BACKEND_URL=http://localhost:4000    # nginx on scale profile
```

and run `docker compose --profile scale up` in `be/` (see backend Part 4 plan).

## Rollback posture

Both parts are per-file reverts in the FE. No deploy coordination needed with BE — parts are additive.
