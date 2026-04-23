export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center w-full min-h-dvh bg-[#0f0f1a]">
      <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
    </div>
  );
}
