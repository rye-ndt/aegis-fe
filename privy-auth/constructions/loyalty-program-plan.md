# Loyalty Program — Frontend Plan

## Goal

Surface the user's loyalty points inside the mini-app as a new **Points**
tab. Read-only in v1: balance, rank, recent ledger entries, and the
top-N leaderboard. Consumes the three new backend endpoints and
introduces no new mutation paths.

## Existing surface (do not re-invent)

- `src/components/StatusView.tsx` owns the `Tab = 'home' | 'configs' |
  'debug'` union, the per-tab render switch, and the `TABS` array
  driving the bottom `TabDock`. Extend in place — do not fork.
- `AppDataProvider` (`src/hooks/useAppData.tsx`) already wraps the tab
  shell with `backendUrl` + `privyToken`. New data hooks should consume
  `useAppData()` for both rather than threading props.
- Privy token is already in scope; reuse the same `Authorization:
  Bearer <privyToken>` header pattern existing tabs use for backend
  calls. The leaderboard endpoint is unauthed — call it without the
  header.
- Tab visual style: violet accent, dark `#0f0f1a` background, rounded
  cards. Match `HomeTab` / `ConfigsTab` spacing and typography. Bottom
  dock auto-fits new entries.
- No router. Tab state is local React state in `StatusView`.

## Changes

### 1. Tab union + dock entry

In `src/components/StatusView.tsx`:

```tsx
type Tab = 'home' | 'points' | 'configs' | 'debug';
```

Add to the `TABS` array between `home` and `configs`:

```tsx
{ id: 'points', label: 'Points', Icon: PointsIcon },
```

Render branch:

```tsx
{tab === 'points' && <PointsTab />}
```

`PointsIcon` is a small inline SVG matching the `HomeIcon` style
(stroke-only, 20px, current colour). Don't pull in an icon library.

### 2. New data hooks

`src/hooks/useLoyalty.ts` — three small fetch hooks, all SWR-style
(fetch on mount, refetch on tab focus). No global cache library — match
whatever pattern `useAppData` already uses for similar reads.

```ts
useLoyaltyBalance(): {
  data: { seasonId: string; pointsTotal: string; rank: number | null } | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

useLoyaltyHistory(limit = 20): {
  data: LedgerEntry[] | null;
  loading: boolean;
  error: string | null;
  loadMore: () => void;        // cursor-based, pulls next page
}

useLoyaltyLeaderboard(limit = 10): {
  data: { entries: { rank: number; pointsTotal: string }[]; seasonId: string } | null;
  loading: boolean;
  error: string | null;
}
```

Notes:
- `pointsTotal` comes from the backend as a string (bigint over JSON).
  Treat as opaque display string; do not parse to `Number` — large
  values overflow.
- Leaderboard returns no `userId` in v1 (privacy). Render rank +
  points only.
- Errors render inline as a small muted line ("Couldn't load points")
  — do not surface a toast. Loyalty is non-critical UX.

### 3. PointsTab component

`src/components/PointsTab.tsx`. Three stacked sections:

1. **Balance card** — large number (`pointsTotal`), small subtitle
   `Season {seasonId}`, rank pill (`#482` or `Unranked`). Skeleton
   shimmer while loading.
2. **Recent activity** — last 10 ledger entries, each row showing:
   - action label (humanised: `swap_cross_chain` → `Swap (cross-chain)`)
   - `+points` (right-aligned, accent colour)
   - relative timestamp (`2h ago`, `yesterday`)
   - "Load more" button at the bottom triggering `loadMore()`. Hide
     when `data.length < limit * page`.
3. **Leaderboard** — top 10 from `useLoyaltyLeaderboard`. Two columns:
   rank, points. The current user's row is **not** highlighted in v1
   (no `userId` in the response).

Action label map lives at the top of the file as a `const`. New action
types added on the backend show their raw id until the map is updated
— acceptable v1 behaviour.

### 4. Empty / unauth states

- New user (`pointsTotal === '0'` and `data` empty): show a friendly
  empty state — "No points yet. Swap, send, or deposit to earn." No CTA
  button (the user is already inside the mini-app; deep-linking to a
  Telegram command is awkward).
- Auth failure on `/balance` or `/history` (401): collapse to the
  leaderboard-only view. Don't redirect to login — the user is already
  authed for the rest of the app, so this would only fire on a stale
  Privy token; let the existing token-refresh path handle it.

### 5. No new global state

Do not stash loyalty data in `AppDataProvider`. The tab is rare-visit;
its hooks fetch fresh on mount and on tab activation. Avoids cache
invalidation on award (no realtime push from backend in v1).

## Out of scope (v1)

- Realtime updates (no SSE / poll loop on the home tab).
- Highlighting the current user in the leaderboard (backend doesn't
  expose `userId`).
- Sharing / referral UI.
- Season countdown / next-season teaser.
- Animated point-earned toasts on Home after a swap.

## Definition of done (v1)

- [ ] `Tab` union extended, `TABS` array updated, dock renders four
      icons cleanly on small viewports.
- [ ] `PointsTab` renders balance, history, leaderboard from the three
      new endpoints.
- [ ] Loading + error + empty states all render without throwing.
- [ ] No `Number()` conversion of `pointsTotal` anywhere.
- [ ] Leaderboard call omits `Authorization` header (public endpoint).
- [ ] Manual smoke: with backend `season-0` active and one ledger
      row inserted, the tab shows the row and rank.
- [ ] `status.md` updated with a `## Points tab — <date>` entry
      describing the new tab and the action-label map convention.
