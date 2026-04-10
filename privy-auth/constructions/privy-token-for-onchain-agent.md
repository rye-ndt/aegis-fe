# Privy Auth → Onchain Agent Integration Plan

> Date: 2026-04-10
> Status: Draft
> Touches: `src/App.tsx`, `src/main.tsx` (config only)

---

## Goal

After Google login via Privy, expose the **Privy access token** on the connected screen so it can be forwarded to the `onchain-agent` backend. That token is what the backend will verify (via Privy's server SDK) to establish a session — replacing the old email/password + JWT flow entirely.

The Privy access token is a JWT signed by Privy's keys. It encodes the user's Privy DID (`sub`), linked Google email, and expiry. The `onchain-agent` backend verifies it using `@privy-io/server-auth` — no Google OAuth credentials are needed anywhere.

---

## What Privy exposes (and what it doesn't)

| Token | Available client-side | Use |
|---|---|---|
| Privy access token (`usePrivy().getAccessToken()`) | Yes — async, returns a fresh short-lived JWT | Send to your own backend for identity verification |
| Google OAuth access token | No — Privy holds it server-side, never forwarded to the browser by default | Not usable here |

The correct integration is: **Privy access token = the bearer credential for the onchain-agent backend**. The backend calls Privy's server SDK to verify it and extract the user's DID and email. This is the Privy-recommended pattern for server-side auth.

---

## Changes

### 1. `src/App.tsx`

#### a. Add `getAccessToken` to the `usePrivy()` destructure in `App`

```typescript
const { ready, authenticated, getAccessToken } = usePrivy()
```

#### b. Fetch the token and pass it into `ConnectedView`

Inside `App`, after the embedded wallet lookup:

```typescript
const [privyToken, setPrivyToken] = React.useState<string | null>(null)

React.useEffect(() => {
  if (!authenticated) return
  getAccessToken().then(setPrivyToken)
}, [authenticated, getAccessToken])
```

Pass to `ConnectedView`:

```typescript
return <ConnectedView eoaAddress={eoaAddress} smartAddress={smartAddress} privyToken={privyToken} />
```

#### c. Update `ConnectedView` props and render

Add `privyToken: string | null` to props. Render a copyable token row below the address rows:

```typescript
function ConnectedView({
  eoaAddress,
  smartAddress,
  privyToken,
}: {
  eoaAddress: string
  smartAddress: string
  privyToken: string | null
}) {
```

Add a new `TokenRow` component (or reuse `AddressRow`) that displays the token truncated and a copy button:

```typescript
function TokenRow({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false)

  const copy = () => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full max-w-sm">
      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1.5 px-1">
        Agent Auth Token
      </p>
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <p className="font-mono text-xs text-white/80 tracking-wide truncate flex-1">
          {token.slice(0, 32)}…
        </p>
        <button
          onClick={copy}
          className="text-xs text-violet-400 hover:text-violet-300 flex-shrink-0 transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[10px] text-white/20 mt-1.5 px-1">
        Send to the bot with: /auth &lt;token&gt;
      </p>
    </div>
  )
}
```

Render inside `ConnectedView`:

```typescript
{privyToken && <TokenRow token={privyToken} />}
```

#### d. Telegram Web App path (optional but recommended)

When running inside Telegram as a mini app, `Telegram.WebApp.sendData()` can push the token directly to the bot without the user manually copying it. Add this after the token is fetched:

```typescript
React.useEffect(() => {
  if (!privyToken || !window.Telegram?.WebApp?.sendData) return
  // Only send once — the bot will receive it as a message from the mini app
  window.Telegram.WebApp.sendData(JSON.stringify({ privyToken }))
}, [privyToken])
```

**Guardrail:** This only fires inside a real Telegram WebApp context. In browser it's a no-op because `window.Telegram?.WebApp?.sendData` will be undefined or unavailable outside the app. The backend Telegram handler needs a corresponding `web_app_data` listener (covered in the onchain-agent plan).

---

## Files changed

| File | Change |
|---|---|
| `src/App.tsx` | Add `getAccessToken` call, `useState<string \| null>`, `useEffect`, `TokenRow` component, updated `ConnectedView` props |

## Files NOT changed

- `src/main.tsx` — `PrivyProvider` config is unchanged; no new Privy config options needed
- `index.html`, `vite.config.ts`, `package.json` — no new dependencies; `@privy-io/react-auth` is already installed

---

## Guardrails

### Token lifetime
Privy access tokens are short-lived (typically 6 hours). `getAccessToken()` transparently refreshes the token if it's close to expiry. The `useEffect` dependency on `authenticated` means if the session is refreshed, the displayed token updates automatically.

### Never persist the token in localStorage
Do not store the Privy token in `localStorage` or `sessionStorage`. The `useState` hook keeps it in memory only — it disappears on page reload, forcing a fresh `getAccessToken()` call (which Privy handles silently if the session is still valid).

### Clipboard API availability
`navigator.clipboard.writeText()` requires a secure context (HTTPS or localhost). In production the mini app runs over Telegram's HTTPS — safe. In local dev over HTTP it will fail silently; add a `try/catch` around the clipboard call.

### sendData is one-shot
`Telegram.WebApp.sendData()` can only be called once per mini app session; calling it again has no effect. The `useEffect` guard (`if (!privyToken …)`) ensures it fires exactly once after the token is available.

### No Google OAuth token is exposed
This plan does not expose the raw Google OAuth access token — Privy does not surface it. The Privy access token is sufficient: it proves Google identity, and the backend can extract the Google email from the verified Privy user object.

---

## Implementation order

1. Add `import React from 'react'` if not already present (needed for `useState`, `useEffect`).
2. Add `getAccessToken` to `usePrivy()` destructure in `App`.
3. Add `privyToken` state + `useEffect` to fetch it.
4. Add `TokenRow` component above `ConnectedView`.
5. Update `ConnectedView` signature to accept `privyToken`.
6. Render `<TokenRow>` inside `ConnectedView`.
7. (Optional) Add `sendData` `useEffect` for Telegram Web App path.
8. Test: log in → token row appears → Copy button works → token is a valid JWT.
