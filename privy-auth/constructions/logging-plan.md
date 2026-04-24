# Frontend Logging Plan — sonner toasts + runtime-toggled logger

> Prerequisite: none.
> Blocks: nothing — incremental migration of existing `console.*` calls.
> Behavior change: errors and warnings surface as toasts even when DebugTab is hidden.

## Why

- Mini-app runs inside Telegram. When a modal covers `DebugTab`, or when the very first fetch fails before UI hydrates, the user sees nothing — they have no console.
- 34 ad-hoc `console.*` calls across `src/`. `useDebugEntries` already intercepts them but only buffers strings tagged `[AEGIS:`. No level filter, no toast surface, no runtime toggle.
- The Vite build needs to ship the same code to all envs; level must be **runtime-switchable** (per user request) so we can turn on `debug` on a single device without rebuilding.

## Library choice — sonner

- ~3 kB gzipped, single dep, React 19 compatible, Tailwind v4 friendly.
- Headless enough to restyle to match the dark glassy aesthetic in `DebugTab.tsx`.
- Stacking, swipe-to-dismiss, auto-timeout, a11y already solved — not worth re-implementing.

Rejected: `react-hot-toast` (fine, but sonner has better stacking); custom (z-index, swipe, queue — multi-day rabbit hole).

## Step 1 — Install + mount

```
pnpm add sonner
```

In `src/App.tsx`, mount once at the root (before any component that may toast):

```tsx
import { Toaster } from "sonner";
// inside the returned JSX, top level
<Toaster position="top-center" richColors closeButton theme="dark" />
```

Pick `position="top-center"` so toasts don't collide with the bottom tab bar.

## Step 2 — Runtime-toggleable logger

Create `src/utils/logger.ts`:

```ts
import { toast } from "sonner";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const LS_KEY = "aegis.logLevel";
const ENV_DEFAULT = ((import.meta.env.VITE_LOG_LEVEL as Level) ?? "info");

let current: Level =
  (typeof localStorage !== "undefined" && (localStorage.getItem(LS_KEY) as Level)) || ENV_DEFAULT;

export function setLogLevel(next: Level) {
  current = next;
  try { localStorage.setItem(LS_KEY, next); } catch {}
}
export function getLogLevel(): Level { return current; }

function enabled(l: Level) { return ORDER[l] >= ORDER[current]; }

function fmt(scope: string, msg: string, ctx?: unknown) {
  const tag = `[AEGIS:${scope}]`;
  return ctx === undefined ? `${tag} ${msg}` : `${tag} ${msg} ${safeJson(ctx)}`;
}
function safeJson(v: unknown) { try { return JSON.stringify(v); } catch { return String(v); } }

export function createLogger(scope: string) {
  return {
    debug(msg: string, ctx?: unknown) { if (enabled("debug")) console.log(fmt(scope, msg, ctx)); },
    info (msg: string, ctx?: unknown) { if (enabled("info"))  console.log(fmt(scope, msg, ctx)); },
    warn (msg: string, ctx?: unknown) {
      if (!enabled("warn")) return;
      console.warn(fmt(scope, msg, ctx));
      toast.warning(msg, { description: scope });
    },
    error(msg: string, ctx?: unknown) {
      if (!enabled("error")) return;
      console.error(fmt(scope, msg, ctx));
      toast.error(msg, { description: scope });
    },
  };
}

// Dev convenience — call from the JS console to flip levels live
if (typeof window !== "undefined") {
  (window as unknown as { __aegisLog: typeof setLogLevel }).__aegisLog = setLogLevel;
}
```

Env contract (Vite-inlined):

| Var | Default | Purpose |
|---|---|---|
| `VITE_LOG_LEVEL` | `info` | Initial level baked at build time |

Runtime override: `localStorage.setItem("aegis.logLevel","debug")` or `window.__aegisLog("debug")` from the device's remote console / DebugTab. Persists across reloads.

## Step 3 — Toast policy

- **`error` and `warn` only** trigger toasts. `debug` and `info` go to console + DebugTab buffer only.
- Toast `description` field carries the scope (e.g., `useAppData`, `loggedFetch`) so the user/dev sees where it came from.
- Don't toast inside hot loops. If a toast call may fire repeatedly, dedupe at the call site by tracking the last error message in a ref.

## Step 4 — Wire DebugTab to the new logger

`useDebugEntries.ts` already monkey-patches `console.log` / `console.warn`. After Step 2:

- The logger always writes through `console.*`, so the existing interceptor keeps working without changes.
- Drop the `if (!text.includes('[AEGIS:'))` filter — every logger output is already tagged. Or keep it; it acts as a noise filter against third-party libs (Privy SDK is chatty). Recommendation: keep the filter, it's load-bearing.
- Extend `LogEntry['level']` to include `'error'` and `'info'` in addition to `'log' | 'warn'`. Patch `console.error` and `console.info` the same way `log`/`warn` are patched today.
- Add a level toggle UI in `DebugTab.tsx`: 4 buttons (debug / info / warn / error) calling `setLogLevel`.

## Step 5 — Migrate existing call sites

34 sites. By area:

1. **`utils/loggedFetch.ts`** — replace `console.log` with `log.debug` for the request line, `log.debug` for the response line. On non-2xx, `log.warn` (so a backend hiccup toasts even with DebugTab hidden). `loggedFetch` already wraps every API call → biggest single win.
2. **`utils/resilientFetch.ts`** — `log.debug` per retry attempt; `log.warn` when retries exhaust (already toasts via #1's response path, but explicit warn here is clearer).
3. **`hooks/useFetch.ts`, `hooks/useRequest.ts`, `hooks/useAppData.tsx`** — fetch error branches → `log.error`. Loading-state transitions → `log.debug`.
4. **`hooks/useDelegatedKey.ts`** — every signing/keypair branch (cache hit, regenerate, install) → `log.debug` for branches, `log.error` for thrown errors. This is the highest-value debugging surface today.
5. **Components** — `App.tsx` mount events, `SigningRequestModal` user actions, all `handlers/*` (Auth, Sign, YieldDeposit, Approve, Onramp) — branch decisions as `debug`, errors as `error`.

## Step 6 — New critical-flow instrumentation

User explicitly asked for new logs in critical flows. On the FE side these are:

### `App.tsx` boot sequence
- `info` "telegram-detected" / "telegram-not-detected" branch.
- `info` "tma-auto-login-timeout" when the 4s timer fires.
- `error` when `requestError` is set.

### `hooks/useDelegatedKey.ts`
- `debug` on `{ choice: "cache-hit" | "regenerate" | "install" }`.
- `info` on each step: `keypair-derived`, `session-key-installed`, `delegation-grant-posted`.
- `error` around every signature call.

### `hooks/useRequest.ts` (signing-request poll loop)
- `debug` per poll attempt with attempt number.
- `info` on `{ step: "request-received", requestId, type }`.
- `warn` on poll exhaustion.

### `components/handlers/*Handler.tsx`
- Each handler logs `{ step: "started" | "submitted" | "succeeded" | "failed", requestId }` at `info`.
- `error` for every catch in `postResponse` / signing.

### `utils/resilientFetch.ts`
- `debug` per retry: `{ attempt, status, willRetry }`.
- `warn` when fall-through after max retries.

**Privacy:** never log `privyToken`, `initData`, `delegated key`, or any signature material. Hash or truncate (`token.slice(0,8)+'…'`) if you must reference one.

## After implementing

Update `fe/privy-auth/status.md`:
- Document `VITE_LOG_LEVEL` env var and the `localStorage["aegis.logLevel"]` runtime override.
- Document the convention: every module uses `createLogger(scope)`; raw `console.*` is forbidden except in the very early bootstrap of `main.tsx` if needed.
- Note the toast policy: only `warn` + `error` toast; `debug`/`info` go to console + DebugTab buffer.

## Out of scope

- No remote log shipping (Sentry, Logflare). The DebugTab "Copy Logs" button + Telegram chat continues to be the user-side incident channel.
- No structured/JSON logs on FE — output is human-readable strings, since we have no parser on the receiving end.
- No build-time stripping of `debug` calls. The runtime gate is enough; bundle-size cost of dead `if (enabled(...))` checks is negligible.
