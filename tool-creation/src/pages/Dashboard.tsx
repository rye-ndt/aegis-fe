import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTools, type ToolManifest } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { usePrivy } from '@privy-io/react-auth';
import { PlusCircle, Search } from 'lucide-react';

export function Dashboard() {
  const { userId } = useAuth();
  const { logout, user } = usePrivy();
  
  const displayName = user?.google?.name || user?.google?.email || user?.email?.address || 'Developer';
  const eoaAddress = user?.wallet?.address;
  const [myTools, setMyTools] = useState<ToolManifest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Workaround: GET /tools returns all tools. We check our local submissions cache.
    const getLocalOwnedToolIds = (): string[] => {
      try {
        const cache = JSON.parse(localStorage.getItem(`aegis_owned_${userId}`) || '[]');
        if (Array.isArray(cache)) return cache;
      } catch (e) {}
      return [];
    };

    fetchTools().then(res => {
      const ownedIds = getLocalOwnedToolIds();
      // Filter so dashboard only shows things this developer submitted
      const filtered = res.tools.filter(t => ownedIds.includes(t.toolId) || t.toolId === 'example-swap-tool');
      setMyTools(filtered);
      setLoading(false);
    });
  }, [userId]);

  return (
    <div className="min-h-dvh bg-transparent text-white relative z-0">
      <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-md p-6 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">Aegis Developer Portal</h1>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{displayName}</p>
            {eoaAddress && (
              <p className="text-[10px] text-white/40 font-mono tracking-widest uppercase mt-0.5">
                {eoaAddress.slice(0, 6)}...{eoaAddress.slice(-4)}
              </p>
            )}
          </div>
          <div className="w-px h-8 bg-white/10 mx-2 hidden sm:block"></div>
          <button onClick={logout} className="text-sm px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors">Sign Out</button>
        </div>
      </header>
      
      <main className="max-w-5xl mx-auto p-6 mt-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-semibold">My Tools</h2>
          <Link to="/tools/new" className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white py-2 px-4 rounded-xl font-medium transition-colors">
            <PlusCircle className="w-5 h-5" />
            Create Tool
          </Link>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-white/5 rounded-xl border border-white/10" />
            <div className="h-24 bg-white/5 rounded-xl border border-white/10" />
          </div>
        ) : myTools.length === 0 ? (
          <div className="text-center py-20 border border-white/5 rounded-2xl bg-white/[0.02]">
            <Search className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-1">No tools published yet</h3>
            <p className="text-white/40">You haven't registered any Tool Manifests.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myTools.map(tool => (
              <Link key={tool.toolId} to={`/tools/${tool.toolId}`} className="group relative block border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_-8px_rgba(124,58,237,0.3)] hover:border-violet-500/50 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/0 via-violet-500/0 to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10 flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-lg text-white group-hover:text-violet-200 transition-colors">{tool.name}</h3>
                  <span className="text-[10px] px-2.5 py-1 bg-white/5 border border-white/10 rounded-md font-mono text-white/60 tracking-wide">{tool.category}</span>
                </div>
                <p className="relative z-10 font-mono text-xs text-white/30 mb-6 truncate">{tool.toolId}</p>
                <div className="relative z-10 flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${tool.indexed === false ? 'bg-yellow-400 shadow-yellow-400/50' : 'bg-emerald-400 shadow-emerald-400/50'}`} />
                    <span className="text-xs font-medium tracking-wide flex items-center text-white/60">{tool.indexed === false ? 'Pending Index' : 'Active'}</span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-10px] group-hover:translate-x-0 duration-300 text-violet-400">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
