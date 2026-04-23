import React from 'react';

// ── Global in-memory log store ────────────────────────────────────────────────

export type LogEntry = { level: 'log' | 'warn'; text: string; ts: string };

const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function notify() { listeners.forEach(fn => fn()); }

const _log = console.log.bind(console);
const _warn = console.warn.bind(console);

function intercept(level: 'log' | 'warn', args: unknown[]) {
  const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  if (!text.includes('[AEGIS:')) return;
  const ts = new Date().toISOString().slice(11, 23);
  entries.push({ level, text, ts });
  if (entries.length > 200) entries.shift();
  notify();
}

console.log = (...args: unknown[]) => { _log(...args); intercept('log', args); };
console.warn = (...args: unknown[]) => { _warn(...args); intercept('warn', args); };

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDebugEntries() {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  React.useEffect(() => {
    listeners.add(forceUpdate);
    return () => { listeners.delete(forceUpdate); };
  }, []);

  return { entries: entries as ReadonlyArray<LogEntry> };
}

// ── Legacy component (kept for backward compat) ───────────────────────────────

export function DebugLog() {
  const { entries: log } = useDebugEntries();
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  const copy = () => {
    const text = log.map(e => `[${e.ts}] ${e.text}`).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div className="w-full max-w-sm mt-4">
      <div className="flex items-center justify-between mb-1 px-1">
        <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Debug Log</p>
        <button onClick={copy} className="text-[10px] text-violet-400 hover:text-violet-300">Copy all</button>
      </div>
      <div className="bg-black/60 border border-white/10 rounded-xl px-3 py-2 h-48 overflow-y-auto font-mono text-[10px] leading-relaxed">
        {log.length === 0 && <p className="text-white/20">Waiting for logs…</p>}
        {log.map((e, i) => (
          <p key={i} className={e.level === 'warn' ? 'text-yellow-400' : 'text-white/70'}>
            <span className="text-white/30">{e.ts} </span>{e.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
