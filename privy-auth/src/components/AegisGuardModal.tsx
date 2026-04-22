import React, { useEffect, useState } from 'react';

interface TokenLimit {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  amountHuman: string;
  validUntil: Date;
}

interface AegisGuardModalProps {
  keypairAddress: string;
  scaAddress: string;
  jwtToken: string;
  onConfirm: (limits: TokenLimit[]) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

interface PortfolioToken {
  address: string;
  symbol: string;
  decimals: number;
  balanceFormatted: string;
}

export function AegisGuardModal({
  keypairAddress,
  scaAddress,
  jwtToken,
  onConfirm,
  onClose,
  isSubmitting
}: AegisGuardModalProps) {
  const [portfolio, setPortfolio] = useState<PortfolioToken[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<Record<string, { amount: string; date: string }>>({});

  const fetchPortfolio = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/portfolio`, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (!res.ok) throw new Error('Failed to load portfolio');
      const data = await res.json();
      
      const tokens: PortfolioToken[] = data.tokens.filter((t: any) => parseFloat(t.balanceFormatted) > 0).map((t: any) => ({
        address: t.address,
        symbol: t.symbol,
        decimals: t.decimals,
        balanceFormatted: t.balanceFormatted
      }));
      setPortfolio(tokens);
    } catch (err: any) {
      setError(err.message || 'Error loading portfolio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, [jwtToken]);

  const handleLimitChange = (address: string, field: 'amount' | 'date', value: string) => {
    setLimits(prev => ({
      ...prev,
      [address]: {
        ...prev[address],
        [field]: value
      }
    }));
  };

  const handleConfirm = () => {
    if (!portfolio) return;
    
    const validLimits: TokenLimit[] = [];
    for (const p of portfolio) {
      const l = limits[p.address];
      if (l && l.amount && l.date) {
        const val = parseFloat(l.amount);
        const dt = new Date(l.date);
        if (!isNaN(val) && val > 0 && dt.getTime() > Date.now()) {
          validLimits.push({
            tokenAddress: p.address,
            tokenSymbol: p.symbol,
            tokenDecimals: p.decimals,
            amountHuman: l.amount,
            validUntil: dt
          });
        }
      }
    }
    
    if (validLimits.length > 0) {
      onConfirm(validLimits);
    }
  };

  const isValid = portfolio && portfolio.some(p => {
    const l = limits[p.address];
    if (!l || !l.amount || !l.date) return false;
    const val = parseFloat(l.amount);
    const dt = new Date(l.date);
    return !isNaN(val) && val > 0 && dt.getTime() > Date.now();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#161622] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#1c1c2a]">
          <h2 className="text-lg font-bold text-white">Enable Aegis Guard</h2>
          {!isSubmitting && (
            <button onClick={onClose} className="text-white/40 hover:text-white pb-1 transition-colors text-xl leading-none">&times;</button>
          )}
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <p className="text-sm text-white/70 mb-4">
            Grant your session key permission to spend tokens on your behalf.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs text-white/40 mb-1 font-semibold uppercase tracking-wider">Spending Key</p>
            <p className="font-mono text-xs text-emerald-400 break-all">{keypairAddress}</p>
          </div>

          {loading && (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
            </div>
          )}

          {error && (
            <div className="py-4 text-center">
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <button 
                onClick={fetchPortfolio}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-sm transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && portfolio && portfolio.length === 0 && (
             <p className="text-center text-sm text-white/50 py-4">No tokens with balance found.</p>
          )}

          {!loading && !error && portfolio && portfolio.map(token => (
            <div key={token.address} className="mb-4 bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-white">{token.symbol}</span>
                <span className="text-sm text-white/50">Balance: {token.balanceFormatted}</span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-white/40 w-12">Limit</span>
                <div className="flex-1 flex gap-2 items-center bg-black/20 rounded-lg border border-white/10 px-3 py-2">
                   <input 
                     type="number"
                     placeholder="0.00"
                     className="bg-transparent text-white text-sm outline-none flex-1 min-w-0"
                     value={limits[token.address]?.amount || ''}
                     onChange={(e) => handleLimitChange(token.address, 'amount', e.target.value)}
                     disabled={isSubmitting}
                   />
                   <span className="text-xs text-white/30 font-medium">{token.symbol}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/40 w-12">Until</span>
                <input 
                  type="date"
                  className="flex-1 bg-black/20 text-white text-sm outline-none border border-white/10 rounded-lg px-3 py-2"
                  value={limits[token.address]?.date || ''}
                  onChange={(e) => handleLimitChange(token.address, 'date', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#1c1c2a]">
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting}
            className="px-5 py-2.5 rounded-xl font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting && <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />}
            {isSubmitting ? 'Enabling...' : 'Enable Aegis Guard'}
          </button>
        </div>
      </div>
    </div>
  );
}
