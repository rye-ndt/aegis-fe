import React from 'react';

interface SignRequestEvent {
  type: 'sign_request';
  requestId: string;
  to: string;
  value: string;
  data: string;
  description: string;
  expiresAt: number;
  autoSign?: boolean;
}

interface PendingSigningRequest {
  event: SignRequestEvent;
  approve: () => Promise<void>;
  reject: () => void;
}

function formatValue(wei: string): string {
  try {
    // Display as ETH/AVAX (18 decimals), trimmed to 6 significant digits
    const value = BigInt(wei);
    if (value === 0n) return '0';
    const eth = Number(value) / 1e18;
    return eth.toPrecision(6).replace(/\.?0+$/, '');
  } catch {
    return wei;
  }
}

export function SigningRequestModal({
  request,
  onClose,
}: {
  request: PendingSigningRequest;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { event } = request;

  // Escape key → reject (unless already submitted)
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading && !txHash) {
        request.reject();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [request, onClose, loading, txHash]);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await request.approve();
      setTxHash('submitted');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setLoading(false);
    }
  };

  const handleReject = () => {
    if (loading) return;
    request.reject();
    onClose();
  };

  const truncateHex = (hex: string, chars = 20) => {
    if (hex.length <= chars * 2 + 2) return hex;
    return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) handleReject();
      }}
    >
      <div className="w-full max-w-sm bg-[#16162a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M2 17l10 5 10-5" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M2 12l10 5 10-5" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold tracking-widest text-amber-400 uppercase">
              Transaction request from bot
            </p>
            <p className="text-sm font-semibold text-white truncate">{event.description}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-72 overflow-y-auto">
          {!showRaw ? (
            <div className="space-y-2.5">
              <div className="flex justify-between gap-4 text-xs">
                <span className="text-white/40 flex-shrink-0">To</span>
                <span className="text-white/80 font-mono text-right break-all">{event.to}</span>
              </div>
              <div className="flex justify-between gap-4 text-xs">
                <span className="text-white/40 flex-shrink-0">Value</span>
                <span className="text-white/80 font-mono text-right">
                  {formatValue(event.value)} AVAX
                </span>
              </div>
              {event.data && event.data !== '0x' && (
                <div className="flex justify-between gap-4 text-xs">
                  <span className="text-white/40 flex-shrink-0">Calldata</span>
                  <span className="text-white/80 font-mono text-right break-all">
                    {truncateHex(event.data)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <pre className="text-[11px] text-white/60 font-mono whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(event, null, 2)}
            </pre>
          )}

          {error && (
            <div className="mt-3 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Toggle */}
        <div className="px-5 pb-2">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors underline underline-offset-2"
          >
            {showRaw ? 'View readable' : 'View raw data'}
          </button>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-white/10">
          <button
            onClick={handleReject}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Signing…
              </>
            ) : (
              'Approve'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
