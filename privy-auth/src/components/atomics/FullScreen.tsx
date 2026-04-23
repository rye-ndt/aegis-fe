import { Spinner } from './spinner';
import { ShieldIcon } from './icons';

export function FullScreen({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4 ${className}`}>
      {children}
    </div>
  );
}

export function FullScreenLoading({ step }: { step?: string | null }) {
  return (
    <FullScreen>
      <Spinner size="lg" />
      {step && <p className="text-sm text-white/40">{step}</p>}
    </FullScreen>
  );
}

export function FullScreenError({
  message,
  showClose = false,
}: {
  message: string;
  showClose?: boolean;
}) {
  return (
    <FullScreen>
      <p className="text-sm text-red-400 text-center">{message}</p>
      {showClose && (
        <button
          onClick={() => window.Telegram?.WebApp?.close()}
          className="text-xs text-white/40 underline underline-offset-2"
        >
          Close
        </button>
      )}
    </FullScreen>
  );
}

/**
 * Success screen shown after a handler completes. Telegram auto-close is
 * triggered by the caller — this component only renders the UI.
 */
export function FullScreenSuccess({
  title,
  subtitle = 'Taking you back to Telegram…',
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6">
      <div className="flex flex-col items-center gap-5 bg-[#161624] border border-white/10 rounded-2xl p-8 w-full max-w-xs shadow-[0_24px_80px_rgba(124,58,237,0.12)]">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-violet-500/20 blur-xl scale-[1.8]" />
          <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-emerald-600/10 border border-violet-500/20">
            <ShieldIcon size={28} variant="success" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-white font-bold text-lg tracking-tight">{title}</p>
          <p className="text-white/40 text-sm mt-1.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/20">
          <Spinner size="xs" className="border-white/15 border-t-white/50" />
          Closing automatically
        </div>
      </div>
    </div>
  );
}
