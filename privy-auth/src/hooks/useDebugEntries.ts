import React from 'react';

export type LogEntry = { level: 'log' | 'warn'; text: string; ts: string };

const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

const _log = console.log.bind(console);
const _warn = console.warn.bind(console);

function intercept(level: 'log' | 'warn', args: unknown[]) {
  const text = args
    .map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  if (!text.includes('[AEGIS:')) return;
  const ts = new Date().toISOString().slice(11, 23);
  entries.push({ level, text, ts });
  if (entries.length > 200) entries.shift();
  listeners.forEach(fn => fn());
}

console.log = (...args: unknown[]) => { _log(...args); intercept('log', args); };
console.warn = (...args: unknown[]) => { _warn(...args); intercept('warn', args); };

export function useDebugEntries() {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    listeners.add(forceUpdate);
    return () => { listeners.delete(forceUpdate); };
  }, []);
  return { entries: entries as ReadonlyArray<LogEntry> };
}
