import React from 'react';

export function BottomSheet({
  open,
  onDismiss,
  children,
  ariaLabel,
}: {
  open: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
        onClick={onDismiss}
      />
      <div className="relative w-full max-w-md mx-auto bg-[#15151f] border-t border-x border-white/[0.08] rounded-t-3xl px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-[0_-12px_40px_rgba(0,0,0,0.6)] animate-[slideUp_220ms_ease-out]">
        <div className="flex justify-center mb-3">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>
        {children}
      </div>
    </div>
  );
}
