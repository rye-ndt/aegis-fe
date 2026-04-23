import React from 'react';
import { DebugLog } from './DebugLog';

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="w-full max-w-sm">
      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1.5 px-1">
        {label}
      </p>
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <div className="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        <p className="font-mono text-xs text-white/80 tracking-wide break-all">
          {address}
        </p>
      </div>
    </div>
  );
}

function TokenRow({ getToken, preview }: { getToken: () => Promise<string | null>; preview: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      const fresh = await getToken();
      if (!fresh) return;
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable in non-secure context
    }
  };

  return (
    <div className="w-full max-w-sm">
      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1.5 px-1">
        Agent Auth Token
      </p>
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <p className="font-mono text-xs text-white/80 tracking-wide truncate flex-1">
          {preview.slice(0, 32)}…
        </p>
        <button
          onClick={copy}
          className="text-xs text-violet-400 hover:text-violet-300 flex-shrink-0 transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[10px] text-white/20 mt-1.5 px-1">
        Send to the bot with: /auth &lt;token&gt;
      </p>
    </div>
  );
}

export function StatusView({
  eoaAddress,
  smartAddress,
  privyToken,
  getAccessToken,
  removeKey,
}: {
  eoaAddress: string;
  smartAddress: string;
  privyToken: string;
  getAccessToken: () => Promise<string | null>;
  removeKey?: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-2xl scale-150" />
        <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-violet-500/10 border border-violet-500/30">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z" fill="url(#shield-connected)" />
            <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="shield-connected" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7c3aed" />
                <stop offset="1" stopColor="#4f46e5" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <p className="text-xs font-semibold tracking-widest text-violet-400 uppercase">Connected</p>
      {smartAddress && <AddressRow label="Smart Wallet" address={smartAddress} />}
      <AddressRow label="Signer (EOA)" address={eoaAddress} />
      <TokenRow getToken={getAccessToken} preview={privyToken} />

      <p className="text-xs text-white/30 text-center max-w-xs">
        Aegis Guard is active — return to Telegram to use the bot.
      </p>

      {removeKey && (
        <button
          onClick={removeKey}
          className="text-xs text-red-500/50 hover:text-red-400 transition-colors duration-200 underline underline-offset-2"
        >
          [dev] Remove session key
        </button>
      )}

      <DebugLog />
    </div>
  );
}
