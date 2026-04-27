import { toast } from 'sonner';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const LS_KEY = 'aegis.logLevel';
const ENV_DEFAULT: Level = (import.meta.env.VITE_LOG_LEVEL as Level | undefined) ?? 'info';

let current: Level =
  (typeof localStorage !== 'undefined' && (localStorage.getItem(LS_KEY) as Level | null)) ||
  ENV_DEFAULT;

export function setLogLevel(next: Level) {
  current = next;
  try { localStorage.setItem(LS_KEY, next); } catch {}
}
export function getLogLevel(): Level { return current; }

function enabled(l: Level) { return ORDER[l] >= ORDER[current]; }

function fmt(scope: string, msg: string, ctx?: unknown) {
  const tag = `[AEGIS:${scope}]`;
  return ctx === undefined ? `${tag} ${msg}` : `${tag} ${msg} ${safeJson(ctx)}`;
}
function safeJson(v: unknown) { try { return JSON.stringify(v); } catch { return String(v); } }

type LogOpts = { toast?: boolean };

export function createLogger(scope: string) {
  return {
    debug(msg: string, ctx?: unknown) { if (enabled('debug')) console.log(fmt(scope, msg, ctx)); },
    info (msg: string, ctx?: unknown) { if (enabled('info'))  console.log(fmt(scope, msg, ctx)); },
    warn (msg: string, ctx?: unknown, opts?: LogOpts) {
      if (!enabled('warn')) return;
      console.warn(fmt(scope, msg, ctx));
      if (opts?.toast === false) return;
      toast.warning(msg, { description: ctx === undefined ? scope : `${scope} — ${safeJson(ctx)}` });
    },
    error(msg: string, ctx?: unknown, opts?: LogOpts) {
      if (!enabled('error')) return;
      console.error(fmt(scope, msg, ctx));
      if (opts?.toast === false) return;
      toast.error(msg, { description: ctx === undefined ? scope : `${scope} — ${safeJson(ctx)}` });
    },
  };
}

// Dev convenience — call from the JS console to flip levels live
if (typeof window !== 'undefined') {
  (window as unknown as { __aegisLog: typeof setLogLevel }).__aegisLog = setLogLevel;
}
