import { createLogger } from './logger';

const log = createLogger('recentBroadcasts');
const LS_KEY = 'aegis.recentBroadcasts.v1';
const DEFAULT_TTL_MS = 10 * 60 * 1000;

type Entry = { hash: string; ts: number };
type Store = Record<string, Entry>;

function payloadKey(to: string, value: string, data: string): string {
  return `${to.toLowerCase()}|${BigInt(value).toString()}|${data.toLowerCase()}`;
}

function load(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed as Store : {};
  } catch {
    return {};
  }
}

function save(store: Store) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch {}
}

function prune(store: Store, ttlMs: number): Store {
  const cutoff = Date.now() - ttlMs;
  const next: Store = {};
  for (const [k, v] of Object.entries(store)) {
    if (v.ts >= cutoff) next[k] = v;
  }
  return next;
}

export function findRecentBroadcast(
  to: string,
  value: string,
  data: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Entry | null {
  const store = prune(load(), ttlMs);
  const hit = store[payloadKey(to, value, data)] ?? null;
  if (hit) log.debug('payload-dedupe-hit', { hash: hit.hash, ageMs: Date.now() - hit.ts });
  return hit;
}

export function recordBroadcast(
  to: string,
  value: string,
  data: string,
  hash: string,
  ttlMs: number = DEFAULT_TTL_MS,
) {
  const store = prune(load(), ttlMs);
  store[payloadKey(to, value, data)] = { hash, ts: Date.now() };
  save(store);
  log.debug('payload-recorded', { hash });
}

// In-flight broadcasts: serializes concurrent sends of the same payload within
// this tab. localStorage dedupe (above) only catches *completed* broadcasts —
// it can't help when two attempts start in parallel (StrictMode double-mount,
// BE re-emitting the same sign_calldata before /response is acked, effect
// re-fire on swap). Without this, both attempts race past findRecentBroadcast,
// both hit the bundler; the first mines + drains the wallet; the second's gas
// estimation reverts with "ERC20: transfer amount exceeds balance" — which the
// user sees as a spurious error toast even though the on-chain tx succeeded.
const inFlight = new Map<string, Promise<string>>();

export function trackInFlightBroadcast(
  to: string,
  value: string,
  data: string,
  send: () => Promise<`0x${string}`>,
): Promise<`0x${string}`> {
  const key = payloadKey(to, value, data);
  const existing = inFlight.get(key);
  if (existing) {
    log.debug('payload-inflight-coalesced', { key });
    return existing as Promise<`0x${string}`>;
  }
  const p: Promise<`0x${string}`> = (async () => {
    try {
      const hash = await send();
      recordBroadcast(to, value, data, hash);
      return hash;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}
