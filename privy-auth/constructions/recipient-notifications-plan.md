# Recipient Notifications (Path A) — Frontend Plan

> Counterpart to `be/constructions/recipient-notifications-plan.md`. The feature itself is delivered entirely as Telegram bot messages — Bob receives a chat message from the bot, not a Mini App push. The Mini App's role is **secondary surfacing** (history + visibility) so Bob can scroll back through "who paid me" without rummaging through chat.
>
> Most of the work is backend. The FE changes are deliberately small.

---

## What the FE does NOT do

- **No push delivery.** The actual notification is a Telegram chat message produced by the bot. The Mini App does not need to subscribe to any new SSE topic for this feature.
- **No new auth surface.** `/start` flushing happens in the bot adapter. By the time the Mini App is opened, pending notifications have already been delivered as chat messages.
- **No new signing flow.** This is a read-only feature for the recipient.

If we later want a real push (banner inside the app when a new transfer lands while Bob is in the Mini App), that's a follow-up — out of scope for v1.

---

## What the FE does do

### 1. Activity feed entry under HomeTab (or a new "Activity" sub-tab)

Surface recent inbound p2p transfers as items in an activity list, sourced from the new BE endpoint:

```
GET /api/notifications?kind=p2p_send&limit=20
→ { items: [{
      id, senderHandle, senderDisplayName,
      tokenSymbol, amountFormatted, chainId, txHash,
      createdAtEpoch, status,
    }, ...] }
```

Each item renders as a row:

```
💸  @alice → 5 USDC on Base                     2 min ago
    [tx: 0xabc…1234] (link to explorer)
```

Tapping the row opens the explorer link in a new tab.

### 2. Welcome moment on first open after `/start`

When the user opens the Mini App for the first time after a `/start` that flushed notifications, show a small intro card on `HomeTab`:

> "👋 You've received N transfers. Open Activity to see them."

The signal: the BE flush sets a flag on `userProfiles` (e.g. `lastFlushAtEpoch`) or includes a `pendingFlushed: number` field on the `/api/me` response for the first request post-flush, then clears it. FE just consumes the field; no client-side bookkeeping.

If `pendingFlushed === 0`, render nothing.

### 3. Empty state

If `items` is empty, show a tasteful empty state on the Activity view:

> "No transfers yet. When someone sends you tokens via @AegisBot, you'll see them here."

---

## Files to modify / create

### `src/hooks/useNotifications.ts` (new)

```ts
import { useFetch } from './useFetch';
import { createLogger } from '../utils/logger';

const log = createLogger('useNotifications');

export type NotificationItem = {
  id: string;
  senderHandle: string | null;
  senderDisplayName: string | null;
  tokenSymbol: string;
  amountFormatted: string;
  chainId: number;
  txHash: string | null;
  createdAtEpoch: number;
  status: 'pending' | 'delivered' | 'failed';
};

export function useNotifications(limit = 20) {
  const { data, error, isLoading, refetch } = useFetch<{ items: NotificationItem[] }>(
    `/api/notifications?kind=p2p_send&limit=${limit}`,
  );
  // …standard error logging via log.error('fetch-notifications-failed', { ... })
  return { items: data?.items ?? [], error, isLoading, refetch };
}
```

Follow `useFetch` / `useRequest` conventions already in `src/hooks/`. Network-level retry/log is handled by the shared fetch hook — do not reinvent.

### `src/components/views/ActivityView.tsx` (new) OR section inside `HomeTab.tsx`

Decision: if the team is shipping a broader Activity tab soon, fold this into it. Otherwise, add a "Recent transfers" section to `HomeTab.tsx` between the balance card and the actions row. Use existing atomic components from `src/components/atomics`. Match the visual rhythm of `YieldPositions.tsx` and `PointsTab.tsx`.

Each row component (`NotificationRow`):

```tsx
const log = createLogger('notificationRow');

function NotificationRow({ item }: { item: NotificationItem }) {
  const sender = item.senderHandle ? `@${item.senderHandle}` : (item.senderDisplayName ?? 'someone');
  const explorer = item.txHash ? buildExplorerUrl(item.chainId, item.txHash) : null;

  const onTap = () => {
    if (!explorer) return;
    log.info('open-explorer', { id: item.id, chainId: item.chainId });
    window.open(explorer, '_blank', 'noopener,noreferrer');
  };

  return (
    <button onClick={onTap} className="…">
      <span>💸</span>
      <span>{sender}</span>
      <span>{item.amountFormatted} {item.tokenSymbol}</span>
      <span>{chainName(item.chainId)}</span>
      <span>{formatRelativeTime(item.createdAtEpoch)}</span>
    </button>
  );
}
```

`buildExplorerUrl` and `chainName` belong in `src/utils/chain.ts` (or wherever existing chain helpers live — match current convention; **do not inline chain IDs**).

### `src/hooks/useAppData.tsx`

Extend the bootstrap response type to include `pendingFlushed?: number`. Plumb through to a new `useWelcomeFlushBanner()` hook (or simpler: read directly in `HomeTab`). The field is one-shot (BE clears it after the response), so cache only in component state, not localStorage.

### `src/components/HomeTab.tsx`

- Import `useNotifications`, render the recent-transfers section.
- If `appData.pendingFlushed > 0`, render a dismissable info card at the top:
  ```
  👋 You've received {pendingFlushed} transfer{s} while you were away.
  ```
  Auto-dismisses on next mount (since BE clears the flag).

### `src/utils/logger.ts`

No changes — already handles toast surfacing for warn/error. New scopes: `useNotifications`, `notificationRow`.

---

## Logging (mandatory per CLAUDE.md)

| Scope | Event | Level | Fields |
|---|---|---|---|
| `useNotifications` | fetch start | debug | `→ GET /api/notifications`, `requestId` |
| `useNotifications` | fetch ok | debug | `← 200`, `count` |
| `useNotifications` | fetch failed | error | `requestId`, `err`, `status` |
| `notificationRow` | open-explorer | info | `id`, `chainId` |
| `homeTab` (existing scope) | welcome-flush-shown | info | `pendingFlushed` |

`warn` and `error` from these scopes will surface as Sonner toasts automatically — only use them for genuinely user-visible failures (e.g. fetch hard-failed). Do **not** error-log empty-list responses.

---

## API contract (must match BE plan)

```
GET /api/notifications
  Query: kind=p2p_send (required for v1), limit=int (default 20, max 50)
  Auth: privy access token, same as other /api endpoints
  200: { items: NotificationItem[] }
  401 / 5xx: handled by useFetch's standard pathway
```

The BE plan already builds the dispatcher and storage. The endpoint itself is a thin read on `recipientNotifications` filtered by `recipientUserId = currentUserId AND status = 'delivered'` ordered by `createdAtEpoch DESC`. Add to BE plan if not already present — the FE depends on it.

> Note for BE: only `delivered` rows surface in the FE list. `pending` rows shouldn't appear because for them, `recipientUserId IS NULL` until flush.

---

## UX states

| State | Component | Behaviour |
|---|---|---|
| First load post-`/start` flush | HomeTab | Welcome card + populated list |
| First load, no transfers ever | HomeTab | List section omitted entirely (don't show empty state on Home) |
| Activity view (if standalone) empty | ActivityView | Friendly empty state copy |
| Loading | both | Shimmer matching existing list-loading convention |
| Fetch failed | both | Sonner toast via `log.error`; list keeps previous data if any |

---

## Edge cases

- **User opens Mini App before `/start` flush completes** (race). The flush is fast (single SQL + 1–N Telegram sends, typically <1s). If the FE list is empty, a manual pull-to-refresh / refetch will pick up the rows once flush completes. No special handling needed.
- **Sender display name contains markdown / emoji.** The chat message renders via the bot's `parse_mode: Markdown`. The FE renders as plain text, so any markdown chars are shown literally — fine. Do **not** dangerouslySetInnerHTML.
- **`chainId` not in `chainConfig`** (unlikely — would mean the BE shipped a chain the FE doesn't know about). Render `Chain ${chainId}` rather than crashing.

---

## Out of scope (matching BE plan)

1. Real-time push to the Mini App (would require SSE topic). Reload/refetch covers v1.
2. Onchain inbound transfers (Path B) — table is shared, but FE filtering will need `kind=onchain_inbound` later.
3. Notification preferences UI (mute toggles).
4. Marking notifications as read inside the app — Telegram is the source of truth for "I saw this".

---

## Status.md update

Append to whichever `status.md` covers `HomeTab` / activity surfaces:

- New endpoint `/api/notifications` and `useNotifications` hook.
- Convention: any future "things that happened *to* the user" feature should extend the `recipientNotifications` table on the BE and add a new `kind` filter to the same hook — not invent a new endpoint.
- New metadata field name in client logs: `count` for fetched-notification batches.
