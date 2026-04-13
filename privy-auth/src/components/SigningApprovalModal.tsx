import React from 'react';
import type { PendingSigningRequest } from '../utils/signingInterceptor';

export function SigningApprovalModal({
  request,
  onClose,
}: {
  request: PendingSigningRequest;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = React.useState(false);
  const { decoded, rawParams } = request;

  // Escape key → reject
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        request.reject();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [request, onClose]);

  const handleApprove = () => {
    request.approve();
    onClose();
  };

  const handleReject = () => {
    request.reject();
    onClose();
  };

  const rawJson = React.useMemo(() => {
    try {
      // rawParams[1] is the typed data JSON string; pretty-print it
      const raw = rawParams[1];
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return JSON.stringify(obj, null, 2);
    } catch {
      return JSON.stringify(rawParams, null, 2);
    }
  }, [rawParams]);

  const fields =
    decoded.type === 'kernel_enable'
      ? decoded.fields
      : Object.entries(decoded.message ?? {}).map(([k, v]) => ({
          label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
          value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
        }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleReject();
        }
      }}
    >
      <div className="w-full max-w-sm bg-[#16162a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"
                fill="url(#modal-shield)"
              />
              <defs>
                <linearGradient id="modal-shield" x1="3" y1="2" x2="21" y2="23" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7c3aed" />
                  <stop offset="1" stopColor="#4f46e5" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold tracking-widest text-violet-400 uppercase">
              Signature request
            </p>
            <p className="text-sm font-semibold text-white truncate">{decoded.summary}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-72 overflow-y-auto">
          {!showRaw ? (
            <div className="space-y-2.5">
              {fields.map((f, i) => (
                <div key={i} className="flex justify-between gap-4 text-xs">
                  <span className="text-white/40 flex-shrink-0">{f.label}</span>
                  <span className="text-white/80 font-mono text-right break-all">{f.value}</span>
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-xs text-white/30 italic">No additional details available.</p>
              )}
            </div>
          ) : (
            <pre className="text-[11px] text-white/60 font-mono whitespace-pre-wrap break-all leading-relaxed">
              {rawJson}
            </pre>
          )}
        </div>

        {/* Toggle */}
        <div className="px-5 pb-2">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="text-[11px] text-violet-400/70 hover:text-violet-400 transition-colors underline underline-offset-2"
          >
            {showRaw ? 'View readable' : 'View raw data'}
          </button>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-white/10">
          <button
            onClick={handleReject}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
