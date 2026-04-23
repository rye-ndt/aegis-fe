type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<SpinnerSize, string> = {
  xs: 'w-3.5 h-3.5 border-2',
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
};

export function Spinner({
  size = 'md',
  className = 'border-violet-500/20 border-t-violet-500',
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  return <div className={`${SIZE_CLASS[size]} rounded-full ${className} animate-spin`} />;
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center w-full min-h-dvh bg-[#0f0f1a]">
      <Spinner size="lg" />
    </div>
  );
}
