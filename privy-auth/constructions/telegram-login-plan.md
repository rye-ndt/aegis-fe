# FE — Telegram Auto-Login via Privy

**Goal:** When a user opens the Mini App from Telegram, they are logged in to Privy automatically
using their Telegram identity — no extra button click, no Google OAuth pop-up. After login, their
embedded EOA and ZeroDev Smart Account are provisioned exactly as today, and the existing
delegation + signing flows continue to work unchanged.

---

## Context & Constraints

| Item | Current state |
|---|---|
| Auth method | Google OAuth (`loginMethods: ['google']`) in `main.tsx` |
| Login trigger | Manual button click in `LoginView` → `login()` |
| Privy SDK | `@privy-io/react-auth ^3.21.0` — already installed |
| TMA SDK | `@tma.js/sdk-react ^3.0.19` — already installed |
| Backend auth route | `POST /auth/privy` – accepts a Privy access token, returns `{ token, expiresAtEpoch, userId }` |
| Delegation | `useDelegatedKey` — already wired, fires once Smart Account address is known |

The key insight: Privy v3 exposes `loginWithTelegram(initDataRaw)` which accepts the raw Telegram
launch params init-data string and performs a server-side JWT verification, creating or recovering
the user's embedded wallet silently. The `@tma.js/sdk-react` package gives us
`retrieveLaunchParams()` to obtain `initDataRaw` inside the Mini App context.

---

## Guardrails (read before touching any file)

1. **Never remove Google OAuth** from `loginMethods`. It must remain as a fallback for users
   opening the app outside Telegram (e.g., directly in a browser).
2. **Do not break existing `useDelegatedKey` / `useSigningRequests` flow.** These hooks depend on
   `authenticated`, `wallets`, and `client` being populated. The only change is *how* those get
   populated — the rest of the app is untouched.
3. **`TelegramAutoLogin` must be idempotent.** If the user is already `authenticated`, the
   component must do nothing. If `loginWithTelegram` is not available on the SDK version, fail
   silently with a console warning (do not crash).
4. **Never log or expose `initDataRaw`** to the console or any analytics service in production
   builds. It contains a signed hash of the user's Telegram identity.
5. **Test inside a real Telegram Mini App context** before merging. `retrieveLaunchParams()` throws
   when called outside the TMA WebView — the component must catch this and bail out (not crash).
6. Each step below must be completed and verified before the next step begins.

---

## Step 1 — Add `telegram` to Privy `loginMethods`

**File:** `src/main.tsx`
**Why:** The `loginWithTelegram` Privy method only works when `telegram` is listed as an allowed
login method. Without this, the SDK will throw a validation error.

**Change:**
```diff
-loginMethods: ['google'],
+loginMethods: ['google', 'telegram'],
```

**Guardrail:** Confirm in the Privy dashboard that the Telegram app ID (not the bot token) is
configured under the "Login methods" → Telegram section. The dashboard will map your Telegram
Mini App's `app_id` to verify the `initData` signature. If it is not configured, `loginWithTelegram`
will return a 401 and the component will bail out gracefully (Step 2 handles this).

**Verification:** `npm run build` completes without TypeScript errors.

---

## Step 2 — Create `src/components/TelegramAutoLogin.tsx`

**Why:** A silent, side-effect-only component that attempts Telegram login on mount. It belongs in
a component so it can use hooks (`usePrivy`) and be server-side-safe.

```tsx
// src/components/TelegramAutoLogin.tsx
import React from 'react';
import { usePrivy } from '@privy-io/react-auth';

/**
 * Silently authenticates the user via Telegram init data when the Mini App
 * opens inside Telegram. Renders nothing — drop this anywhere inside PrivyProvider.
 *
 * Conditions that cause early exit (no error shown to user):
 *  - Already authenticated
 *  - Not running inside Telegram WebView (window.Telegram not present)
 *  - retrieveLaunchParams throws (e.g. outside TMA context)
 *  - loginWithTelegram is not a function on this SDK version
 */
export function TelegramAutoLogin() {
  const { ready, authenticated, loginWithTelegram } = usePrivy();
  const attemptedRef = React.useRef(false);

  React.useEffect(() => {
    // Wait for Privy to finish initialising before proceeding.
    if (!ready) return;
    // Already logged in — nothing to do.
    if (authenticated) return;
    // Only attempt once per mount (StrictMode fires effects twice in dev).
    if (attemptedRef.current) return;
    // Guard: not inside a Telegram Mini App WebView.
    if (!window.Telegram?.WebApp) return;

    attemptedRef.current = true;

    (async () => {
      try {
        // Dynamically import to avoid crashing in non-TMA contexts.
        const { retrieveLaunchParams } = await import('@tma.js/sdk-react');
        const launchParams = retrieveLaunchParams();
        const initDataRaw = launchParams.initDataRaw;

        if (!initDataRaw) {
          console.warn('[TelegramAutoLogin] initDataRaw is empty — cannot authenticate');
          return;
        }

        if (typeof loginWithTelegram !== 'function') {
          console.warn('[TelegramAutoLogin] loginWithTelegram not available on this Privy version');
          return;
        }

        await loginWithTelegram({ initDataRaw });
        // On success, Privy sets `authenticated = true`, which re-renders App
        // with ConnectedView — delegation flow picks up from there automatically.
      } catch (err) {
        // Log only in development; never surface raw error to end user.
        if (import.meta.env.DEV) {
          console.warn('[TelegramAutoLogin] failed silently:', err);
        }
        // Intentionally swallow — LoginView will still render for manual login.
      }
    })();
  }, [ready, authenticated, loginWithTelegram]);

  return null;
}
```

**Guardrail:** `loginWithTelegram` is typed on the `usePrivy()` return value in `@privy-io/react-auth ^3.x`.
If TypeScript reports `loginWithTelegram does not exist on type`, confirm the package version
matches and add a `// @ts-ignore` with a TODO comment — do **not** change the package version
without testing the full delegation flow.

**Verification:** Component renders in `npm run dev` without TypeScript errors.

---

## Step 3 — Mount `TelegramAutoLogin` in `src/main.tsx`

**Why:** Must be inside `<PrivyProvider>` so it has access to `usePrivy()`, but it should fire
before `App` renders so login can complete during the loading spinner phase.

**File:** `src/main.tsx`

```diff
+import { TelegramAutoLogin } from './components/TelegramAutoLogin.tsx'

 createRoot(document.getElementById('root')!).render(
   <StrictMode>
     <PrivyProvider ...>
       <SmartWalletsProvider>
+        <TelegramAutoLogin />
         <App />
       </SmartWalletsProvider>
     </PrivyProvider>
   </StrictMode>,
 )
```

**Guardrail:** `TelegramAutoLogin` renders `null`, so it has zero visual impact.
The loading spinner gating on `!ready` in `App` already hides the UI while Privy initialises —
auto-login completes before the spinner disappears in practice.

**Verification:**
- `npm run build` is clean.
- Open in browser (non-TMA): no error thrown, Google login button still appears.

---

## Step 4 — Remove the `sendData` relay (now superseded)

**Context:** `App.tsx` → `usePrivySession` currently calls `window.Telegram.WebApp.sendData(JSON.stringify({ privyToken }))` after login. This was the *old* mechanism that sent the Privy token back to the bot via the WebApp data channel, triggering `bot.on("message:web_app_data")` in the handler.

With Telegram auto-login, the backend now authenticates the user directly during the `POST /auth/privy` HTTP call (which is still made by `usePrivySession`). The `sendData` relay is **redundant and confusing** — remove it.

**File:** `src/App.tsx`, function `usePrivySession`

```diff
-  // Relay token to the Telegram bot automatically when running inside a mini app
-  React.useEffect(() => {
-    if (!privyToken || !window.Telegram?.WebApp?.sendData) return;
-    window.Telegram.WebApp.sendData(JSON.stringify({ privyToken }));
-  }, [privyToken]);
```

**Guardrail:** The bot's `message:web_app_data` handler still exists in the backend. Removing the
frontend call does **not** break the backend — the handler simply never fires. The backend plan
covers whether that handler should be kept or removed.

**Verification:** After removing, confirm that `POST /auth/privy` is still called by `usePrivySession`
and the backend JWT is still stored in `backendJwt` state. The delegation flow must still work.

---

## Step 5 — Handle the "loading state" during auto-login

**Context:** While `TelegramAutoLogin` is in flight, `authenticated` is `false` and `ready` may already
be `true`. This means `LoginView` would flash briefly before auto-login completes.

**File:** `src/App.tsx`

Add a state flag that suppresses the login view during the TMA auto-login window:

```diff
+import { TelegramAutoLoginState } from './components/TelegramAutoLogin.tsx';

 export default function App() {
   const { ready, authenticated } = usePrivy();
   ...

+  // Suppress LoginView briefly when inside Telegram while auto-login is in flight.
+  const isTmaContext = Boolean(window.Telegram?.WebApp);
+  const showLogin = !isTmaContext || authenticated;

   if (!ready) return <LoadingSpinner />;

-  if (authenticated) {
+  if (authenticated) {
     ...
   }

-  return <LoginView />;
+  return showLogin ? <LoginView /> : <LoadingSpinner />;
 }
```

**Alternative (simpler):** Add a 2-second timeout before showing `LoginView` only inside TMA.
Choose whichever the implementing agent prefers, but document the choice.

**Guardrail:** The spinner must never be shown indefinitely. If Privy's `ready` takes > 5 s,
something is wrong with the SDK configuration — not a retry loop here.

---

## Step 6 — End-to-end verification checklist

Run these checks before marking the plan complete:

- [ ] `npm run build` succeeds with zero TypeScript errors.
- [ ] Open in browser (non-TMA): Google login button renders, no console errors.
- [ ] Open in Telegram Mini App: app shows loading spinner → auto-logs in → `ConnectedView`
      renders with EOA and Smart Account addresses populated.
- [ ] `POST /auth/privy` is fired and `backendJwt` is set in `usePrivySession`.
- [ ] Delegation flow (`useDelegatedKey`) still prompts for password on first launch.
- [ ] Signing approval modal still works end-to-end.
- [ ] No `initDataRaw` value appears in `console.log` output in production build.

---

## Files touched

| File | Action |
|---|---|
| `src/main.tsx` | Add `telegram` to `loginMethods`; mount `<TelegramAutoLogin />` |
| `src/components/TelegramAutoLogin.tsx` | **NEW** — silent auto-login component |
| `src/App.tsx` | Remove `sendData` relay; add TMA loading-guard |

## Files NOT touched

Everything else in `src/` — hooks, utils, other components — is untouched.
The `useDelegatedKey`, `useSigningRequests`, `usePendingSigning` hooks continue to work exactly
as before once `authenticated` becomes `true`.
