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
  // TODO: loginWithTelegram exists in @privy-io/react-auth v3 SDK but may be missing from
  // the type declarations depending on the exact patch version installed. Remove the ts-ignore
  // once the types are updated upstream.
  // @ts-ignore — loginWithTelegram is present at runtime in @privy-io/react-auth ^3.21.0
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
