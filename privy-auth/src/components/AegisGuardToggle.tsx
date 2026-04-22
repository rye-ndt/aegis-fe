import React from 'react';

interface AegisGuardToggleProps {
  enabled: boolean;
  isLoading: boolean;
  onEnable: () => void;
  onDisable: () => void;
  disabledReason?: string; // If session key not set up yet
}

export function AegisGuardToggle({
  enabled,
  isLoading,
  onEnable,
  onDisable,
  disabledReason
}: AegisGuardToggleProps) {
  const isDisabled = isLoading || !!disabledReason;

  const handleClick = () => {
    if (isDisabled) return;
    if (enabled) {
      onDisable();
    } else {
      onEnable();
    }
  };

  return (
    <div 
      className="flex items-center justify-between w-full max-w-sm bg-white/5 border border-white/10 rounded-xl px-4 py-3 group relative"
      title={disabledReason}
    >
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-white">Aegis Guard</span>
        <span className={`text-[10px] uppercase tracking-widest font-semibold mt-0.5 ${enabled ? 'text-emerald-400' : 'text-white/40'}`}>
          {isLoading ? 'Wait...' : enabled ? 'Active' : 'Off'}
        </span>
      </div>
      
      <button 
        className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${enabled ? 'bg-violet-600' : 'bg-black/40 border border-white/10'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={handleClick}
        disabled={isDisabled}
        title={disabledReason}
      >
        <div 
          className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full transition-transform duration-300 flex items-center justify-center shadow-md ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
        >
          {isLoading ? (
            <div className="w-3 h-3 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
          ) : null}
        </div>
      </button>
    </div>
  );
}
