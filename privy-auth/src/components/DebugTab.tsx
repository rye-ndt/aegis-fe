import React from 'react';
import { useDebugEntries } from '../hooks/useDebugEntries';

export function DebugTab() {
  const { entries } = useDebugEntries();
  const [copied, setCopied] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  const copy = () => {
    const text = entries.map((e) => `[${e.ts}] ${e.text}`).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="flex flex-col px-4 pt-10 pb-28">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">Console</p>
          <p className="text-[10px] text-white/20 mt-0.5">{entries.length} entries</p>
        </div>
        <button
          onClick={copy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
            copied
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-white/[0.04] border-white/10 text-violet-400 hover:bg-white/[0.08]'
          }`}
        >
          {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy Logs</>}
        </button>
      </div>

      <div
        className="bg-black/60 border border-white/10 rounded-xl px-3 py-3 overflow-y-auto font-mono text-[10px] leading-relaxed"
        style={{ minHeight: 'calc(100dvh - 220px)' }}
      >
        {entries.length === 0 && <p className="text-white/20 text-center py-8">No logs yet…</p>}
        {entries.map((e, i) => (
          <p key={i} className={`py-px ${e.level === 'warn' ? 'text-yellow-400' : 'text-white/70'}`}>
            <span className="text-white/25 select-none">{e.ts} </span>{e.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
