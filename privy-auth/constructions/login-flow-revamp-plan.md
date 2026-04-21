# Login Flow Revamp — Frontend (Mini App)

> Date: 2026-04-21
> Status: Draft
> Touches: `src/App.tsx`

---

## Goal

After a successful Privy login inside the mini app:

1. The user sees a confirmation screen ("You're signed in — you can return to Telegram").
2. The mini app optionally auto-closes so the user is returned to Telegram where the bot's welcome message is waiting.

No changes to the auth mechanism itself: the FE already calls `POST /auth/privy` with `privyToken` + `telegramChatId`, and the backend already responds with `{ token, expiresAtEpoch, userId }`.

---

## Context

| Item | Current state |
|---|---|
| Auth call | `usePrivySession` in `App.tsx` calls `POST /auth/privy` on every Privy token change |
| Response | `{ token: string; userId?: string }` stored in `backendJwt` |
| On success | `ConnectedView` renders wallet addresses and signing queue |
| Telegram context detection | `isTelegramMiniApp()` — truthy when `window.Telegram.WebApp.initData` is non-empty |
| Mini app close API | `window.Telegram.WebApp.close()` — closes mini app and returns user to Telegram |

---

## What changes

### A — Show "Return to Telegram" screen instead of `ConnectedView` when inside Telegram

When the user opened the mini app from a Telegram login button, they only need to see:
- Confirmation that they are signed in
- An instruction / button to return to Telegram

They do **not** need to see wallet addresses or the signing queue — those are Telegram-native interactions.

**File:** `src/App.tsx`

#### New component inside App.tsx (no separate file needed)

```tsx
function TelegramSuccessView({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
      <div className="text-5xl">✅</div>
      <h1 className="text-2xl font-semibold">Signed in!</h1>
      <p className="text-muted-foreground max-w-xs">
        You are now connected to Aegis. Return to Telegram to start using the agent.
      </p>
      <button
        className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium"
        onClick={onClose}
      >
        Return to Telegram
      </button>
    </div>
  );
}
```

#### Update `App` return logic

```tsx
export default function App() {
  const { ready, authenticated } = usePrivy();
  const { backendJwt } = usePrivySession();

  if (!ready) return <LoadingSpinner />;

  // Inside Telegram mini app: once backend JWT is obtained, show success screen
  if (authenticated && backendJwt && isTelegramMiniApp()) {
    return (
      <TelegramSuccessView
        onClose={() => window.Telegram.WebApp.close()}
      />
    );
  }

  if (authenticated) {
    return <ConnectedView client={...} jwtToken={backendJwt} />;
  }

  // Non-Telegram context OR no backendJwt yet: show loading spinner
  // (TelegramAutoLogin is in flight — avoid flashing LoginView)
  if (isTelegramMiniApp()) return <LoadingSpinner />;

  return <LoginView />;
}
```

**Why `backendJwt` as the gate, not just `authenticated`?**
The backend JWT means the backend has processed the login, created the session, and sent the Telegram welcome message. Showing the success screen before the backend confirms would be misleading.

---

### B — Auto-close after a short delay (optional, configure via env)

For a smoother UX, auto-close 2 seconds after the success screen appears:

```tsx
function TelegramSuccessView({ onClose }: { onClose: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  // ...same JSX...
}
```

If auto-close is undesirable (e.g. for debugging), set `VITE_DISABLE_AUTO_CLOSE=true` in `.env.local` and guard with:

```tsx
const autoClose = !(import.meta.env.VITE_DISABLE_AUTO_CLOSE === 'true');
React.useEffect(() => {
  if (!autoClose) return;
  const timer = setTimeout(onClose, 2000);
  return () => clearTimeout(timer);
}, [onClose, autoClose]);
```

---

## Guardrails

### No architecture break
- `TelegramSuccessView` is a pure UI component with no hooks or side effects beyond the optional auto-close timer.
- `isTelegramMiniApp()` is the existing helper — no new detection logic.
- The `ConnectedView` rendering path is unchanged for non-Telegram contexts.

### No hardcoded values
- Auto-close delay is a named constant `TELEGRAM_SUCCESS_AUTO_CLOSE_MS = 2000` defined at the top of `App.tsx`, not a magic number inline.
- "Return to Telegram" label text is in the component JSX — easy to change.

### No behavior change for non-Telegram users
- The `isTelegramMiniApp()` guard ensures the success screen only appears inside a real Telegram WebView.
- Browser users still see `ConnectedView` when authenticated.

### `window.Telegram.WebApp.close()` safety
- `window.Telegram.WebApp` is always defined when `telegram-web-app.js` is loaded (which it is, per `index.html`).
- `isTelegramMiniApp()` returns true only when `initData` is non-empty, which is only the case inside a real Telegram WebView, so `.close()` will work.
- The "Return to Telegram" button remains visible as a fallback in case the timer is disabled.

---

## Files touched

| File | Change |
|---|---|
| `src/App.tsx` | Add `TelegramSuccessView` component; update main render logic to show it inside Telegram |

## Files NOT touched

Everything else — `useSigningRequests`, `usePrivySession`, `TelegramAutoLogin`, `LoginView`, `ConnectedView` — is untouched.

---

## Implementation order

1. Add `TELEGRAM_SUCCESS_AUTO_CLOSE_MS = 2000` constant near top of `App.tsx`.
2. Add `TelegramSuccessView` component inside `App.tsx`.
3. Update the `App` return logic to branch on `isTelegramMiniApp() && authenticated && backendJwt`.
4. `npm run build` — must be clean.
5. Test in browser (non-Telegram): `ConnectedView` still renders on authenticated, `LoginView` on unauthenticated.
6. Test in Telegram Mini App: after Privy login, success screen appears → auto-closes in 2s → user is back in Telegram chat with the bot's welcome message visible.
