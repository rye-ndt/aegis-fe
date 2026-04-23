# /buy (Onramp) — Frontend Plan

## Goal

Handle the new `requestType: "onramp"` mini-app request by opening Privy's
MoonPay funding flow with as few clicks as possible. The user lands from a
Telegram web-app button and should see a card-payment sheet, not an
intermediate confirmation page.

## Existing surface (do not re-invent)

- `src/App.tsx` is the request-type dispatcher. It reads `?requestId=`, pulls
  the request from the backend, and routes by `request.requestType`
  (`auth` / `sign` / `approve`). Add an `onramp` branch here.
- Privy is already initialized app-wide (`PrivyProvider`). The `useFundWallet`
  hook ships with `@privy-io/react-auth` and is not currently used anywhere
  in the repo — confirmed by search.
- `ConfigsTab.tsx` already treats `smartAccountAddress` as the user's primary
  "receives funds" address. Fund the same address here for consistency.

## Changes

### 1. App-level routing

In `src/App.tsx`, extend the `request.requestType` switch:

```tsx
case "onramp":
  return <OnrampHandler request={request} />;
```

Keep the existing loading / error / expired states unchanged.

### 2. `OnrampHandler` component

New file: `src/components/OnrampHandler.tsx`.

Responsibilities:

1. Extract `{ amount, asset, chainId, walletAddress }` from `request.payload`.
2. On mount (once Privy `ready && authenticated`), call
   `fundWallet(walletAddress, { amount: String(amount), asset, chain })`
   **immediately** — no extra button press. This is the "minimum clicks"
   requirement.
3. While the MoonPay sheet is open, render a minimal status screen ("Opening
   card payment…"). If `fundWallet` throws or the user closes the sheet,
   render a single retry button that re-invokes `fundWallet` with the same
   args.
4. On success (or when MoonPay returns control), show a short confirmation
   ("Payment submitted. Funds will arrive in a few minutes.") and a **Back
   to Telegram** hint. We cannot reliably detect on-chain settlement from
   here — don't pretend to.

Notes on the Privy call:

- `fundWallet` accepts the **target address** as its first argument. Pass
  `walletAddress` (the smart-account address) explicitly. Do NOT rely on the
  default, which funds the embedded EOA — that would leave funds in the
  wrong wallet.
- Map `chainId` → Privy's chain descriptor. Use a small helper
  (`src/helpers/privyChain.ts`, new) that translates the backend's numeric
  `chainId` to whatever shape the installed Privy version expects
  (`{ id: chainId }` in recent versions). Keep this helper as the only place
  chain translation happens on the frontend — mirrors the backend's
  `chainConfig` discipline.
- Pass `asset: "USDC"` through unchanged from the payload. If Privy's
  typing requires an enum, assert at the helper boundary.

### 3. Auth gating

The mini-app already requires a logged-in Privy session for `sign` /
`approve`. Reuse the same gate — if the user is not authenticated, fall
through to the existing login flow, then resume the onramp on return
(App.tsx already re-runs the dispatcher after auth).

### 4. Error states

- **Privy not ready / not authenticated after grace period** → show login
  prompt (reuse existing component).
- **`fundWallet` throws synchronously** (e.g. unsupported chain on testnet)
  → surface the error text verbatim and offer a **Copy address** fallback
  showing `walletAddress` so the user can still deposit manually.
- **Request expired / not found** → reuse existing expired-request view.

## Why this shape

- **Auto-invoke `fundWallet` on mount**: the user already clicked a button
  in Telegram to get here; any further click is pure friction and defeats
  the "onboard users with no web3 knowledge" goal.
- **Pass `walletAddress` explicitly**: Privy's default funds the embedded
  EOA, but this app treats the smart account as the user's wallet. Silent
  mismatch here would be the worst possible bug — funds arrive but
  invisible in the portfolio.
- **No local success detection**: MoonPay settlement is async and involves
  KYC, card auth, and bridging. Claiming "done" from the frontend would lie.
  A backend deposit-watcher is the right place to notify; explicitly out of
  scope here.
- **Dedicated `OnrampHandler` instead of reusing `SignHandler`**: the flow
  has no signature, no calldata, and no confirmation step. Reusing
  `SignHandler` would mean carrying dead branches.

## New conventions introduced

- `src/helpers/privyChain.ts` is the single translation point between the
  backend's numeric `chainId` and Privy SDK chain descriptors. Record in
  `fe/privy-auth/status.md`.
- `requestType: "onramp"` handler auto-invokes its primary action on mount
  rather than waiting for user click. Document this pattern in status.md so
  future low-friction flows (eg. quick top-ups) can follow it without
  debate.

## Out of scope

- Listening for deposit confirmation.
- Showing portfolio updates inside the onramp page.
- Any signing, approval, or delegation.
- Non-USDC assets or non-active chains.

## Touch list

- `src/App.tsx` — add `onramp` case
- `src/components/OnrampHandler.tsx` (new)
- `src/helpers/privyChain.ts` (new)
- Shared `MiniAppRequest` type (if FE has its own copy) — add `onramp`
  variant matching the backend payload
- `fe/privy-auth/status.md` — record new conventions
