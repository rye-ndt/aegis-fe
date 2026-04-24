# Yield Optimization — Implementation Plan (Mini-App)

> Authored: 2026-04-24
> Status: Awaiting implementation
> Companion to: `be/constructions/yield-optimization-plan.md`

---

## 0. What This Builds

The mini-app side of proactive yield optimization. Two new sign-request kinds, one new `/positions` view, and one polish: when the user taps "Deposit 25%" in Telegram, the mini-app opens, auto-signs the pending userOp, and closes — no user-visible interaction when delegation already covers the amount.

Why the mini-app must be involved at all: the session key lives in Telegram CloudStorage, AES-GCM encrypted with material derived from `privyDid`. The backend cannot decrypt. Any userOp signature for yield deposits/withdrawals has to flow through the mini-app's existing session-key pipeline. Reuses `SignHandler` infrastructure from `mini-app-signing-flow.md`.

---

## 1. New Sign-Request Kinds

Extend the existing `SignRequest` discriminated union (type source lives in FE `types/signRequest.ts`, mirrored on BE).

```ts
kind: 'yield_deposit'
  | 'yield_withdraw'
  | ... existing kinds
```

Shared shape:

```ts
{
  kind: 'yield_deposit' | 'yield_withdraw',
  requestId: string,
  userId: string,
  chainId: number,
  protocolId: string,              // e.g. 'aave-v3'
  tokenAddress: Address,
  steps: TxStep[],                 // approve(if needed) + pool call
  displayMeta: {
    protocolName: string,          // 'Aave v3'
    tokenSymbol: string,           // 'USDC'
    amountHuman: string,           // '125.00'
    expectedApy?: number,          // decimal, e.g. 0.0412 — deposit only
  }
}
```

Reuse `SignHandler`'s multi-step execution (already written for `swap`). No new signing primitive required.

### 1.1 Approve-then-sign chain

When the backend emits `ApproveRequest` (subtype `'aegis_guard'`) **before** the deposit sign, the existing `ApprovalOnboarding` flow handles it. On backend completion, the same polling loop (`GET /request/:requestId?after=<prev>`) will surface the follow-up `yield_deposit` sign request. `SignHandler` already handles `after=<prev>` — no change.

---

## 2. New Handler — `YieldDepositHandler`

**File:** `src/handlers/YieldDepositHandler.tsx`

Strictly speaking this is thin UI over `SignHandler`. Purpose: show a pre-sign screen with *what* the user is opting into ("Deposit 125 USDC into Aave v3 @ ~4.12% APY") **only when `displayMeta.expectedApy` is present**, then delegate to the shared sign pipeline.

Rules:
- If auto-open was triggered by a `yield:opt:<pct>` callback and everything is ready (delegation covers, session key present), **skip the pre-sign screen** and call the shared sign pipeline directly. Show a minimal "Depositing 125 USDC to Aave v3…" splash while the userOp is in flight; auto-close on success. This is the "mini-app flashes and closes" UX — confirmed required by the user.
- If something is off (no session key, delegation insufficient and no pending approval), fall back to the normal pre-sign screen with a "Deposit" button.

`YieldWithdrawHandler` is the same component with different copy ("Withdrawing all funds from Aave v3 → your wallet"). Share the implementation under one file with a `mode` prop.

---

## 3. Positions View

**User requirement:** "users don't want their money to vanish without knowing where it went to."

### 3.1 New endpoint (BE side, noted here for FE contract)

`GET /yield/positions` → returns

```ts
{
  positions: [{
    protocolId: 'aave-v3',
    protocolName: 'Aave v3',
    chainId: 43114,
    tokenSymbol: 'USDC',
    principalHuman: '100.00',    // lifetime deposits − withdrawals
    currentValueHuman: '101.28',
    pnlHuman: '+1.28',
    pnl24hHuman: '+0.04',
    apy: 0.0412,
  }],
  totals: { principalHuman, currentValueHuman, pnlHuman }
}
```

### 3.2 `src/hooks/useYieldPositions.ts`

React Query–style hook that fetches `/yield/positions`. Cached in `AppDataProvider` like the portfolio and delegations fetches already are (per `fe/privy-auth/status.md`) — do **not** introduce a separate cache layer.

### 3.3 `src/components/YieldPositions.tsx`

Table/cards list: per row — protocol logo + name, token, principal, current value, delta, APY. Empty state: "No active yield positions. Try `/yield` in Telegram."

### 3.4 Where it surfaces

Add a new tab or section on the main portfolio screen (whatever the existing `AppDataProvider`-consuming page is). Two options — pick whichever matches the current IA:
- **Inline section** below the portfolio list (recommended — fewer clicks, matches "don't hide their money").
- **Dedicated `/positions` route** if the portfolio screen is already crowded.

Decide during implementation based on current layout; document the choice in `fe/privy-auth/status.md`.

---

## 4. Deep-link Handling

The auto-open-and-sign UX depends on the mini-app knowing **which** `requestId` to pull on launch. Existing `SignHandler` already reads `requestId` from the launch URL (per `mini-app-signing-flow.md`). Backend emits the mini-app URL with `?requestId=<id>&kind=yield_deposit` (kind is informational — handler is picked by the request's `kind` field after fetch).

No new launch-parameter plumbing needed beyond routing `kind: 'yield_deposit' | 'yield_withdraw'` to `YieldDepositHandler` in the existing handler switch.

---

## 5. `status.md` Updates

In `fe/privy-auth/status.md`, add a "Yield Optimization" section covering:

- Two new `SignRequest.kind` values and which handler renders them.
- New `GET /yield/positions` contract and where `YieldPositions` component mounts.
- Auto-open-and-sign behavior: when callback-triggered and preconditions met, `YieldDepositHandler` skips the pre-sign screen and the mini-app closes automatically.
- Deferred work (mirrors BE status):
  - Partial withdrawal UI.
  - Multi-stable display.
  - Position historical chart (PnL over time).
  - Protocol logos for non-Aave protocols once added.
- New conventions:
  - Yield-related `SignRequest.kind` values are prefixed `yield_`.
  - Position data is fetched through `AppDataProvider` — never fetch it ad hoc from a leaf component.

---

## 6. Implementation Order

1. Extend `SignRequest` types (new `kind` values + `displayMeta`).
2. Add handler routing for `yield_deposit` / `yield_withdraw`.
3. `YieldDepositHandler` — pre-sign screen + splash mode.
4. Auto-open-and-sign path: plumb the "skip pre-sign" branch; verify on a Fuji stub.
5. `useYieldPositions` hook + `YieldPositions` component.
6. Mount `YieldPositions` in the portfolio screen.
7. `status.md` update.

---

## 7. Testing

- **Unit:** handler state machine (pre-sign vs splash vs fallback); `useYieldPositions` empty/populated/error states.
- **Manual E2E** (paired with BE §12):
  - Nudge → tap 25% → mini-app opens, flashes, closes. Verify deposit visible in positions within 30s.
  - Nudge → tap custom → typed amount that exceeds delegation → approval screen → sign → deposit screen → sign.
  - `/withdraw` command → mini-app opens → sign → positions list empties.
  - Open mini-app manually (no pending request) → positions list renders.
