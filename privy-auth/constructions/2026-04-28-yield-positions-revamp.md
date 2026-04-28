# Implementation plan: Yield positions revamp — frontend impact

**Status:** Planned
**Author / date:** 2026-04-28
**Scope:** Frontend (`fe/privy-auth/src/`). Backend plan lives at `be/constructions/2026-04-28-yield-positions-revamp.md`.

---

## 1. TL;DR

The backend revamp (on-chain position discovery + subgraph-backed principal + `snapshot-missing` warn) **preserves the `GET /yield/positions` HTTP response schema**. So the FE work is small and mostly observational:

- No type or hook signature change.
- `useYieldPositions` keeps working as-is.
- The user can now see positions opened **outside Aegis** (different frontend / direct contract). The UI must not assume "I created this position from the deposit flow" anywhere.
- New transient state: a fresh on-chain position whose principal hasn't propagated through the subgraph yet displays `pnlHuman ≈ 0` for a short window. Confirm this isn't surfaced as "broken" in the UI.

---

## 2. Files touched

| File | Change |
|---|---|
| `src/components/YieldPositions.tsx` | None to types. Optional copy/empty-state tweak (§3). |
| `src/hooks/useAppData.tsx` (`useYieldPositions`, `parseYieldPositions`) | None — schema unchanged. |
| Any deposit-success / withdraw-success handler that previously assumed a `depositId` echoed back | Audit (§4). |

No new components, no new hooks.

---

## 3. UX considerations for the new states

### 3.1 Externally-opened positions

Once the BE probes Aave directly, a user who deposited from outside Aegis will suddenly see a row appear with no prior interaction. Verify this reads correctly:

- `protocolName` + `tokenSymbol` already render generically (`YieldPositions.tsx:66-68`) — fine.
- The avatar uses `tokenSymbol` initials, not provenance — fine.
- The empty state copy currently reads `"No active yield positions. Try /yield in Telegram."` (`YieldPositions.tsx:32`). Still correct as the *empty* message; no change.

### 3.2 Pending-principal window

When a position is brand-new (or just discovered on-chain but the subgraph hasn't indexed it):

- BE returns `principalHuman == currentValueHuman` and `pnlHuman == "+0.00"`.
- The PnL pill renders green (`pnlPositive` truthy because `+0.00` starts with `+`, line 55). Acceptable — looks neutral.
- The 24h pill is also `+0.00` until tomorrow's snapshot. Same handling.

No code change needed; just confirm visually during testing that a fresh Aave deposit shows neutral PnL rather than appearing broken.

### 3.3 Optional: tooltip / status hint (defer)

Could surface "syncing on-chain history…" when `principalHuman == currentValueHuman` and the position is newly-seen. Defer — adds state we don't have today (BE would need to expose a `principalSyncing` flag), and the visual is already non-alarming.

---

## 4. Audit: deposit/withdraw success handlers

The BE removes `recordDeposit` / `recordWithdrawal` DB writes (no more `depositId` round-trip). If any FE flow relied on a `depositId` returned from the deposit-build endpoint:

```bash
# from fe/privy-auth
grep -rn "depositId\|withdrawalId" src/
```

Two outcomes:

- **No hits:** nothing to change.
- **Hits in a handler:** swap the identifier for `txHash` (already returned). Update any `log.info('step', { step: 'submitted', requestId, depositId })` to use `txHash` instead. Keep the logger scope and step convention intact per `CLAUDE.md`.

This audit runs first, before any BE deploy, so we can ship a no-op FE change (rename the field) ahead of the BE cutover.

---

## 5. Testing checklist

Manual, in browser, with the BE running against the new subgraph provider:

1. **Empty state** — wallet with no Aave position → shows `No active yield positions…`.
2. **Aegis-created position** — deposit through the existing `/yield` flow → row appears, `pnlHuman ≈ 0` immediately, `apy` populated.
3. **Externally-opened position** — manually supply USDC to Aave from a different frontend using the same smart account → row appears on next refresh **without any deposit ever flowing through Aegis bookkeeping**. This is the regression test for issue (1).
4. **Snapshot-missing 24h fallback** — clear `yield_position_snapshots` for the user, hit `/yield/positions`, confirm `pnl24hHuman == "+0.00"` and the BE emits the `snapshot-missing` warn (visible in BE logs, not FE).
5. **Subgraph lag** — confirm a freshly-deposited position renders cleanly (no NaN, no negative PnL spike) while subgraph catches up. The BE fallback (`principalRaw = balanceRaw`) should make this invisible.
6. **Withdraw flow** — `/withdraw` then refresh; the row drops out of the list once on-chain `aToken.balanceOf` is zero (the on-chain probe filters zero balances at the BE).

---

## 6. Logging (per CLAUDE.md FE rules)

No new FE logging required for this work — the round-trip is already covered by the existing `useFetch` instrumentation in `useAppData.tsx`. Do **not** add toast-level `log.warn` for the pending-principal window; it's a normal transient, not a degraded path the user can act on.

If §4's audit reveals a handler that switches from `depositId` to `txHash`, update its existing `log.info('step', { … })` payload to swap the field name, nothing more.

---

## 7. Sequencing relative to the BE plan

1. **FE first (safe):** §4 audit + field rename if any. Ships independently.
2. **BE rollout:** new ports + use-case rewrite (§§3–6 of the BE plan). FE keeps working because schema is preserved.
3. **FE verification:** run §5 checklist after BE is on staging.
4. **BE migration:** drop `yield_deposits` / `yield_withdrawals` (BE plan §5.4, deferred to a follow-up deploy).

---

## 8. Out of scope

- New components or layout changes. The current `YieldPositions.tsx` UI is sufficient.
- Surfacing a "synced via subgraph" badge — no product value yet.
- Showing per-position deposit history (would need a new BE endpoint querying the subgraph for `Deposit` events; not requested).
