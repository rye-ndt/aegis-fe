# Prediction-Market Positions list — Frontend

Date: 2026-05-21
Status: plan
Pair: `be/constructions/2026-05-21-pm-positions-list-be.md`. Ship together (FE depends on BE Slice 1 payload shape and Slice 2 routes).

## Why

The mini-app today has no surface for prediction-market positions. `YieldPositions.tsx` renders DeFi positions on HomeTab; nothing analogous exists for the bet flow. The user-visible gap (per the 2026-05-21 audit): a user with open Polymarket positions can only close them by waiting for a Telegram position card.

This plan adds:

1. A **Prediction Positions** section on HomeTab below YieldPositions, fed by the (enriched) `GET /predictionMarket/positions` endpoint.
2. A **tap-to-close bottom sheet** that previews PnL and triggers the close via the new BE `POST /predictionMarket/positions/:id/close`, then hands off to `SignHandler` via `?requestId=<id>` so the existing sign-queue UI signs the sell order.

**No new chat capability, no new deep-link verb, no new sign-handler kind.** The existing `eip712 purpose='polymarket_order'` primitive (landed by `2026-05-20-one-click-bet-fe.md` Slice 2) carries the close. We are only adding a list view + a confirm sheet that enqueues a sign request via HTTP and reloads the mini-app into the existing sign flow.

## Non-goals

- No live orderbook quote per card on the list (BE doesn't return one; tap-to-preview fetches it). Mirrors YieldPositions, which shows stored values.
- No in-app cancellation of pre-execution `betIntent` rows. Those are chat-only; positions are post-fill objects only.
- No new tab. The list lives on HomeTab to match the YieldPositions pattern.
- No refactor of `SignHandler` / `dispatchSign`. We only navigate into them.
- No live PnL recompute on FE — render whatever BE returns in `currentValueUsdcCents`. If null, hide the PnL row.

## Convention adherence

| Concern           | Existing convention reused                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data source       | `useFetch` via `AppDataProvider` (`hooks/useAppData.tsx`) — same pattern as `useYieldPositions`.                                                                                                                            |
| Refresh           | `refetchOnVisible: true` (same as `delegations` in `useAppData.tsx:127`).                                                                                                                                                   |
| Section UI        | Mirror `YieldPositions.tsx` 1:1 — header label, empty state, row layout.                                                                                                                                                    |
| Card UI           | Reuse `bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3` row chrome from `YieldPositions:PositionRow`.                                                                                                       |
| Tap target        | `<button>` wrapper around the row (same accessible pattern as `NotificationRow` in `HomeTab.tsx:244`).                                                                                                                      |
| Bottom sheet      | Reuse `SigningRequestModal` if it doubles as a generic confirm modal; otherwise add a thin `ConfirmSheet` primitive. **Audit first** — if no reusable sheet exists, the new sheet is the one new piece (justified, see §3). |
| Sign-flow handoff | `window.location.assign('?requestId=<id>')` — same query param the chat flow uses (`useRequest.ts:16`).                                                                                                                     |
| Logging           | `createLogger('predictionPositions')` + `createLogger('closePositionSheet')`; emit `step` events per CLAUDE.md FE rules.                                                                                                    |
| Privacy           | Never log `marketId`/`outcomeTokenId` longer than 12 chars in user-facing toasts. Internal debug logs may carry full ids.                                                                                                   |

## Design

### 1. Data layer — extend `useAppData.tsx`

Add types and a `useFetch` registration alongside `useYieldPositions`:

```ts
// fe/privy-auth/src/hooks/useAppData.tsx

export type PmPosition = {
  id: string;
  marketId: string;
  outcomeTokenId: string;
  side: string; // raw 'yes' | 'no' | custom
  marketQuestion: string; // BE-joined; never null
  outcomeLabel: string; // 'YES' | 'NO' | outcome name
  sizeShares: string;
  entryPriceAvgBps: number;
  entryStakeUsdcCents: number;
  currentValueUsdcCents: number | null;
  status: "open" | "closing" | "closed" | "resolved";
  openedAtEpoch: number;
};

export type PmPositionsData = { positions: PmPosition[] };

function parsePmPositions(body: unknown): PmPositionsData {
  const data = (body ?? {}) as Record<string, unknown>;
  // BE returns { positions: PositionListItem[] } strictly — paired BE deploy
  // ships the new shape. No legacy dual-shape branch; we don't want a
  // permanent tolerance for the old bare-array shape.
  const positions = (data.positions ?? []) as PmPosition[];
  return { positions };
}

// Inside AppDataProvider:
const pmPositions = useFetch<PmPositionsData>(
  privyToken && backendUrl ? `${backendUrl}/predictionMarket/positions` : null,
  {
    headers: authHeaders,
    transform: parsePmPositions,
    errorMessage: "Could not load prediction positions",
    refetchOnVisible: true,
  },
);

// Expose:
export const usePmPositions = () => useAppData().pmPositions;
```

Add `pmPositions: Resource<PmPositionsData>` to the `AppData` type and include it in the `value` memo (and its dep array).

> **Filter rule**: BE returns rows where `status IN ('open', 'closing')`. The FE renders both:
>
> - `'open'` → interactive card (tap → ClosePositionSheet).
> - `'closing'` → non-interactive card with inline spinner + "Closing…" overlay, dimmed (`opacity-60`). The row stays visible until the close finalizes server-side; the next `refetchOnVisible` drops it.
>
> `'closed'` and `'resolved'` are not returned by BE — they have no actionable surface and Activity-style history is out of scope.

### 2. Section component — `PredictionPositions.tsx`

Add `fe/privy-auth/src/components/PredictionPositions.tsx`. Direct mirror of `YieldPositions.tsx`, with these adjustments:

- Header label: `Prediction Positions` (matches "Yield Positions" cap).
- Totals: show `≈ $<sum of currentValueUsdcCents/100>` (rounded to 2 decimals). Hide totals if any row's `currentValueUsdcCents` is null (mixed-state would mislead).
- Empty state: `"No open prediction positions. Try /bet in Telegram."` — matches YieldPositions empty-state phrasing.
- Row layout: same chrome as `YieldPositions.PositionRow`:
  - **Left badge** — 9×9 rounded box. Color: `bg-violet-500/10 border-violet-500/15` (distinct from yield-emerald). Inside, render `outcomeLabel` (`YES`/`NO`) in 9px bold violet. For multi-outcome markets, truncate label to 3 chars.
  - **Middle** — top line: `marketQuestion` truncated to 1 line (`truncate` class). Subline: `${sizeShares} shares · ${formatPrice(entryPriceAvgBps)}` in 10px violet-tinted text.
  - **Right** — current value (`$${(currentValueUsdcCents/100).toFixed(2)}`) on top; PnL pill below: `+$X.YZ (+W.W%)` green / red based on `currentValueUsdcCents − entryStakeUsdcCents`. If `currentValueUsdcCents == null` show only `$${entryStake/100}` with no PnL.
- The whole row is a `<button onClick={() => setSheetPosition(p)}>` so the entire surface is the tap target.
- A row with `status === 'closing'` renders as a non-button div with a small inline spinner + `Closing…` overlay; disable interaction.

Tap state lives in the section component (`useState<PmPosition | null>`); when set, render `<ClosePositionSheet position={p} onDone={...} onCancel={() => setSheetPosition(null)} />`.

### 3. Bottom sheet — `ClosePositionSheet.tsx`

Add `fe/privy-auth/src/components/ClosePositionSheet.tsx`. The audit first:

- Search for any existing bottom-sheet / modal primitive in `fe/privy-auth/src/components/atomics/` and `fe/privy-auth/src/components/`. If `SigningRequestModal` (or similar) is generic enough, reuse it.
- If not, this is a small bespoke component — `fixed inset-x-0 bottom-0` panel with a dark backdrop. Keep it to a single file, no animation library; use plain CSS transitions.

Behaviour:

```
mount → POST nothing; instead GET /predictionMarket/positions/:id/previewClose
        (use useFetch with manual trigger, or plain loggedFetch)
loading → show spinner + position summary (marketQuestion, side, sizeShares, entry stake)
loaded  → render preview rows:
            Size            X shares
            Quote (bid)     $0.XX
            Est. proceeds   $X.YZ   (emphasis)
            Entry stake     $X.YZ
            Est. PnL        +$X.YZ (+W.W%)
          + two buttons: [Close position] (primary) [Cancel] (ghost)
preview 404 → "That position is no longer open." + single dismiss button
```

On `[Close position]` tap:

1. Set `submitting = true`, disable both buttons.
2. `POST ${backendUrl}/predictionMarket/positions/:id/close` with auth header.
3. On success body `{ enqueuedRequestId }`:
   - If `enqueuedRequestId` is a string:
     - **Persist current tab** so the user lands back where they were after sign:
       `sessionStorage.setItem('tabAfterSign', currentTab)` (read by `StatusView` mount effect to restore selected tab; absent → default 'home').
     - `window.location.assign(\`${window.location.pathname}?requestId=${enqueuedRequestId}\`)`. The mini-app reloads; `useRequest`reads the param;`App.tsx`mounts`SignHandler`; the existing one-click flow signs the close. When SignHandler completes and the mini-app reopens fresh, `StatusView`consumes`tabAfterSign` once and removes it.
   - If `null` (waiting on setup; rare for close): show `toast.info("Close queued. Reopen the mini-app shortly.")`, call `positions.refetch()`, close the sheet.
4. On non-2xx:
   - `409 POSITION_WRONG_STATUS` → toast: "Position state changed. Refreshing." + `refetch()` + close sheet.
   - `409 BET_IN_FLIGHT` → toast: "Another bet is being placed. Try again in a moment."
   - `404 POSITION_NOT_OPEN` → toast: "That position is no longer open." + `refetch()` + close sheet.
   - Other → `log.error('close-failed', { positionId, err: msg, status })` (the project logger surfaces this as a Sonner toast per FE rules).

Tap `[Cancel]` → `onCancel()`. The sheet is purely client-state; no BE call needed.

### 4. Wire into HomeTab

`fe/privy-auth/src/components/HomeTab.tsx` — add one import + one JSX line after `<YieldPositions />`:

```tsx
import { PredictionPositions } from './PredictionPositions';
// ...
<YieldPositions />
<PredictionPositions />
<RecentTransfers ... />
```

No layout changes. The section follows the same vertical rhythm.

### 5. Sign-flow handoff edge cases

- **The user has another `?requestId=` in flight (e.g. they came from chat).** `useRequest` reads the param on mount; if we navigate over the top of it, we replace the in-flight request. The check: if `useRequest()` already has a non-null `requestId` from the URL when the user opens HomeTab, **we don't render `HomeTab` at all** — `App.tsx` mounts a handler instead. So by the time the user can tap a position card, there is no other request in flight. No coordination needed.
- **`?requestId=` reload latency.** `window.location.assign` triggers a full SPA reload; auth context re-bootstraps. Acceptable per the existing chat-flow contract. A follow-up could lift `requestId` into React state and re-key `App` for a soft handoff, but that's outside scope here.
- **User backgrounds the mini-app mid-sign.** Same as the existing one-click flow: BE's stuck-bet sweeper re-enqueues, the close is idempotent server-side.

### 6. Logging

Per CLAUDE.md FE rules:

```ts
// PredictionPositions
log.debug("list-rendered", { count: positions.length });
log.info("row-tapped", { positionId: p.id });

// ClosePositionSheet
log.info("step", { step: "started", positionId });
log.debug("preview-fetched", { positionId, estProceedsUsdcCents });
log.info("step", { step: "submitted", positionId, enqueuedRequestId });
log.warn("close-conflict", { positionId, code }); // 409s
log.error("close-failed", { positionId, status, err: msg });
```

Never log `marketId`/`outcomeTokenId` beyond `slice(0,8)+'…'` in user-visible messages; full ids are fine in `debug`.

### 7. Files added / changed

Added:

- `fe/privy-auth/src/components/PredictionPositions.tsx` (~120 LOC, mirrors `YieldPositions.tsx`)
- `fe/privy-auth/src/components/ClosePositionSheet.tsx` (~180 LOC)

Changed:

- `fe/privy-auth/src/hooks/useAppData.tsx` — add `PmPosition`, `PmPositionsData`, `pmPositions` resource, `usePmPositions` export.
- `fe/privy-auth/src/components/HomeTab.tsx` — one import + one JSX line.
- `fe/privy-auth/src/components/StatusView.tsx` — on mount, consume-and-clear `sessionStorage.getItem('tabAfterSign')` to restore the user's pre-sign tab.

No deletions.

## Tasks (shippable slices)

**Slice 1 — read-only list (gated on BE Slice 1):**

1. Extend `useAppData.tsx` with `PmPosition` types + `usePmPositions`.
2. Add `PredictionPositions.tsx` (including the `'closing'` dimmed-row branch — BE already returns those rows).
3. Wire into `HomeTab.tsx`.
4. **Unit test** `parsePmPositions`: `{positions: [...]}` shape → returned as-is; `{}` / `null` → empty array; never throws on malformed input.
5. **Component test** `PredictionPositions`: renders N cards for N open positions; renders a dimmed non-interactive card for a `'closing'` position; renders the empty state when list is empty.
6. Manual test: place a paper bet via chat → it fills → open mini app → row appears under Prediction Positions with correct question/YES-NO badge/size.

**Slice 2 — tap-to-preview (gated on BE Slice 2 preview route):**

7. Add `ClosePositionSheet.tsx` with the preview fetch only (no close button wired). Render preview rows.
8. Wire tap from list → sheet. Sheet does not mount for `'closing'` rows.
9. **Component test** `ClosePositionSheet`: mocked 200 preview → renders all five rows with correct formatting; mocked 404 → renders "no longer open" + dismiss-only; loading state shows spinner.
10. Manual test: tap a card → sheet shows live PnL preview matching the chat preview card.

**Slice 3 — close action (gated on BE Slice 2 close route):**

11. Wire `[Close position]` button → POST `/close` → on success set `sessionStorage.tabAfterSign` and `window.location.assign('?requestId=…')`.
12. Wire `StatusView` mount effect to consume-and-clear `tabAfterSign`.
13. Error mapping per §3.
14. **Component test** `ClosePositionSheet` close action:
    - mocked 200 `{enqueuedRequestId: 'abc'}` → `window.location.assign` spy called with `?requestId=abc`; `sessionStorage.tabAfterSign` set.
    - mocked 200 `{enqueuedRequestId: null}` → info toast surfaced; `positions.refetch` called; sheet closes; no navigation.
    - mocked 409 `BET_IN_FLIGHT` → warn toast; sheet stays open.
    - mocked 409 `POSITION_WRONG_STATUS` → warn toast; `positions.refetch` called; sheet closes.
    - mocked 404 `POSITION_NOT_OPEN` → toast; `refetch`; sheet closes.
    - Double-tap on Close button → POST fires exactly once (submitting flag).
15. Manual test: tap Close → mini-app reloads into SignHandler → signs → closes; positions list refetches on next visibility and the row is gone; user lands on the tab they were on before Close.

**Slice 4 — polish + docs:**

16. Empty/error states match YieldPositions copy + chrome (cross-check side-by-side on TG mobile).
17. Append `fe/privy-auth/status.md` entry: "Prediction-market positions list + tap-to-close added. Mirrors YieldPositions; close reuses the existing sign-queue via `?requestId=` handoff with `sessionStorage.tabAfterSign` tab restore. No new SignHandler primitive."

Each slice is independently revertable. Slice 1 ships dark (read-only). Slice 2 ships dark behind a tap. Slice 3 is the user-visible cutover.

## Risks + mitigations

- **`window.location.assign` for handoff feels heavy.** Acceptable for v1 — same pattern as the chat → mini-app flow. Tab restore via `sessionStorage.tabAfterSign` prevents the user from being teleported back to HomeTab after the sign. Tracked as a follow-up to soft-route within React; not blocking.
- **Stale positions list after close completes.** Mitigation: `refetchOnVisible: true` re-pulls on mini-app reopen; `SignHandler` closes the mini-app at the end of the sign flow, so the next open re-fetches. The `'closing'` row stays visible (dimmed) during the sign window so the user sees their action took effect.
- **Double-tap on Close button.** Mitigation: `submitting` flag disables the button; BE returns 409 on the second call anyway. Covered by component test.
- **Wire shape coupling.** BE plan ships the new `{positions}` shape strictly (no legacy bare-array tolerance). FE and BE deploy together — we don't carry a dual-shape parser as permanent tech debt. If a hotfix forces them out of sync, fall back to dual-shape locally and tear out within one cycle.
- **Multi-outcome markets.** Not a concern — `RawMarket.outcomesCount === 2` always (binary filter at ingestion, `PredictionMarketTypes.ts:26`). BE returns `outcomeLabel` as `'YES'` or `'NO'`.
- **Position with `currentValueUsdcCents == null`** (newly opened, not yet reconciled). Hide PnL row; show stake only. Don't crash on `null * number`. Covered by component test.
- **Concurrent close from chat + mini-app.** BE handles via state machine; FE handles via 409 → refetch.
- **`sessionStorage.tabAfterSign` leakage.** Mitigation: `StatusView` consumes and removes the key on the first mount after the sign reload. If the user closes the mini-app mid-sign and reopens later, the key still applies on next mount and gets cleared — at worst the user lands on the previously-active tab, which is the desired UX anyway.

## Acceptance

- Open mini-app with N open positions → "Prediction Positions" section renders N cards with correct question, YES/NO badge, size, entry stake, current value, PnL.
- A `'closing'` position renders as a dimmed non-interactive row with "Closing…" affordance — does not open the sheet on tap.
- After Close → SignHandler signs → mini-app reopens → user lands on the tab they were on before tapping Close (`tabAfterSign` restore worked, key is gone from sessionStorage).
- All component tests in slices 1–3 pass; double-tap test confirms exactly one POST.
- Tap a card → bottom sheet opens, shows live preview from `/previewClose` within ≤1s.
- Tap [Close position] → mini-app reloads into SignHandler → no further taps required → mini-app closes within ≤10s. Position transitions `open → closing → closed`.
- Refresh the mini-app after a close → the closed position is gone from the list.
- Tap [Cancel] in sheet → sheet dismisses, no BE call.
- Trigger a `BET_IN_FLIGHT` race (place a bet, then try to close another position before it settles) → toast surfaces a friendly message, list state unchanged.
- Close the same position from Telegram chat while the FE sheet is open → tap [Close position] → 404 `POSITION_NOT_OPEN` → friendly toast + sheet closes + list refetches.
- Empty positions list → "No open prediction positions. Try /bet in Telegram." rendered (same chrome as YieldEmpty).
- No new Sonner toasts during the success path of close (silent, matches `/send`).
- Lighthouse / manual perf check: rendering 20 position cards doesn't drop frame rate on TG mobile.

## fe/privy-auth/status.md updates after merge

- Top-of-file entry: "Prediction-market positions list — 2026-MM-DD". Mention:
  - New `usePmPositions` hook + `PredictionPositions` section on HomeTab.
  - Close uses `?requestId=` handoff into the existing `SignHandler` `eip712 polymarket_order` primitive — **no new sign primitive, no new handler, no new deep-link verb**.
  - `useFetch` parser tolerates both bare-array and `{positions}` shapes for backwards compatibility during the BE cutover.
  - Convention: cross-feature read endpoints that need a list with metadata are consumed as `{ <feature>: <Item>[] }` on FE; parsers should tolerate the legacy bare-array shape during migration windows.
