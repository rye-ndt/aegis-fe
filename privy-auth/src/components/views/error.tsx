export function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-dvh bg-[#0f0f1a] px-6 gap-4">
      <p className="text-sm text-red-400 text-center">{message}</p>
      <button
        onClick={() => window.Telegram?.WebApp?.close()}
        className="text-xs text-white/40 underline underline-offset-2"
      >
        Close
      </button>
    </div>
  );
}
