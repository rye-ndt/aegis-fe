# Mini-App Scaling — Part 2: Stateless-routing audit

> Prerequisite: none.
> Behavior change: **none.** This part is primarily verification; any code change is a small regression guard.
> Purpose: prove the FE has no assumption that consecutive requests land on the same backend replica, and encode that guarantee so it doesn't regress later.

## What we're verifying

With Cloud Run multi-replica (BE Phase 2 Part 4), two consecutive requests from the same mini-app session may hit different replicas. The FE must not care. Specifically:

1. **No cookies** — server-side session storage would imply sticky routing.
2. **No `credentials: 'include'`** — any `Set-Cookie` from the BE would otherwise round-trip.
3. **All auth is stateless** — `Authorization: Bearer <privyToken>` on every request. Token is verified per-replica using the Phase 1 Part 3 LRU cache.
4. **Idempotent request IDs** — `request/:id` is resolvable anywhere; `POST /response` is safe to retry (wrapped in Phase 1 / `resilientFetch`).
5. **No client-side state holds server-issued opaque handles** that would only be valid on one replica.

## Audit results (grep, 2026-04-24)

| Check | Command | Result |
| --- | --- | --- |
| Cookies used? | `grep -rn "document.cookie\|Cookie" src/` | **0 hits**. Clean. |
| `credentials: 'include'`? | `grep -rn "credentials" src/` | **0 hits**. Clean. |
| Auth mechanism | `grep -rn "Authorization" src/` | Bearer token only, attached per-request. |
| Persistent state | `grep -rn "localStorage" src/` | Only `src/utils/telegramStorage.ts` — user profile prefs, not server-issued handles. |
| Session IDs | `grep -rn "sessionId\|csrf" src/` | **0 hits**. Clean. |

Conclusion: the FE is already stateless from the server's perspective. No refactor needed. The residual work is:

1. Write a regression guard so future contributors don't add sticky behavior.
2. Document the invariant in the FE `status.md`.

## Step 2.1 — Add a regression guard

New file `src/utils/__tests__/statelessness.test.ts` (or wherever tests live — check existing test infra; if none, skip this step and rely on the audit).

```ts
import { describe, expect, it } from 'vitest'; // or whatever runner is set up
import fs from 'node:fs';
import path from 'node:path';
import glob from 'fast-glob';

/**
 * The mini-app must not assume sticky routing to a single backend replica.
 * Enforce that by static-scanning source for patterns that imply server-side
 * session state. If a legitimate need arises, the relevant file must
 * explicitly opt out with the comment `// STATELESS-AUDIT: allowed because …`.
 */
describe('stateless-routing guarantees', () => {
  const files = glob.sync('src/**/*.{ts,tsx}', { cwd: path.resolve(__dirname, '../../..') });

  const forbid = (pattern: RegExp, reason: string) => {
    for (const f of files) {
      const body = fs.readFileSync(f, 'utf8');
      if (pattern.test(body) && !/STATELESS-AUDIT: allowed/.test(body)) {
        throw new Error(`${f} uses ${reason} without STATELESS-AUDIT comment`);
      }
    }
  };

  it('never uses document.cookie', () => {
    forbid(/document\.cookie/, 'document.cookie');
  });

  it("never sends credentials: 'include'", () => {
    forbid(/credentials\s*:\s*['"]include['"]/, "credentials: 'include'");
  });

  it('never reads a Set-Cookie header', () => {
    forbid(/headers\.get\(['"]set-cookie['"]\)/i, 'Set-Cookie consumption');
  });
});
```

If the project doesn't have a test runner yet, skip this step. It's a nice-to-have, not a shipping blocker.

## Step 2.2 — Document the invariant

Append to `fe/privy-auth/status.md`:

```
## Stateless-routing invariant (2026-04-24)

The mini-app must not assume sticky routing to a single backend replica.

Every request must be self-authenticating (Bearer token on every fetch) and
every server-issued handle (e.g. `requestId`) must resolve on any replica.
This is enforced by:

- Authorization: Bearer <privyToken> added by `utils/postResponse.ts`,
  `utils/fetchNextRequest.ts`, and any `useFetch` callsite.
- No cookies, no `credentials: 'include'`, no Set-Cookie consumption.
- Request IDs are Redis-backed on BE (`mini_app_req:{id}`,
  `pending_collection:{channelId}`) and therefore visible from any replica.

Violations must be explicitly opted out with `// STATELESS-AUDIT: allowed because <reason>`
in source and accompanied by a backend-side sticky-routing setup.
```

## Step 2.3 — Smoke test against local multi-replica BE

Once BE Phase 2 Part 4's `--profile scale` is running:

```
# be/
docker compose --profile scale up -d

# fe/privy-auth/
VITE_BACKEND_URL=http://localhost:4000 npm run dev
```

Walk through:

1. Login (mini-app opens, Privy auth completes).
2. Trigger a multi-step flow (e.g. a swap): "Swap 1 USDC to AVAX". Walk the signing prompts to completion.
3. While doing that, tail `docker compose logs -f api` in the BE repo. You'll see multiple `api-1`, `api-2`, `api-3` entries — the flow crossed replicas.
4. Flow completes successfully. No "session expired", no "unknown request", no duplicate prompts.

That's the full behavioral proof.

## Rollback

Only Step 2.1 adds a file; delete if it becomes flaky. Step 2.2 is documentation. Step 2.3 is a manual test.

## Acceptance

- Audit table documented and accurate.
- Status.md updated with the invariant.
- (Optional) Test passes.
- Smoke test succeeds against scaled compose.

## When to revisit

- If authentication ever moves to a server-side session (e.g. httpOnly cookie): review whether sticky routing is needed and how to configure Cloud Run's session affinity (`--session-affinity`) — but prefer keeping auth stateless.
- If a new FE feature requires holding an opaque handle between requests: ensure the handle is stored in Redis on BE, not in-process.
