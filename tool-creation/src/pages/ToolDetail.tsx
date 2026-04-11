import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchTools, deactivateTool, type ToolManifest } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Trash2 } from 'lucide-react';

export function ToolDetail() {
  const { toolId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [tool, setTool] = useState<ToolManifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTools().then(({ tools }) => {
      const match = tools.find(t => t.toolId === toolId);
      if (match) {
        setTool(match);
      }
      setLoading(false);
    });
  }, [toolId]);

  const handleDeactivate = async () => {
    if (!toolId) return;
    if (!confirm('Are you sure you want to deactivate this tool?')) return;
    try {
      await deactivateTool(toolId, token);
      
      // Clear from local storage
      const { userId } = useAuth();
      try {
        const cacheRaw = localStorage.getItem(`aegis_owned_${userId}`);
        if(cacheRaw) {
          const cache = JSON.parse(cacheRaw);
          const filtered = cache.filter((id: string) => id !== toolId);
          localStorage.setItem(`aegis_owned_${userId}`, JSON.stringify(filtered));
        }
      } catch (e) {}
      
      navigate('/dashboard');
    } catch (err) {
      alert('Failed to deactivate tool.');
    }
  };

  if (loading) {
    return <div className="min-h-dvh flex items-center justify-center text-white bg-[#0f0f1a]">Loading...</div>;
  }

  if (!tool) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-white bg-[#0f0f1a]">
        <h2 className="text-xl font-bold mb-4">Tool not found</h2>
        <Link to="/dashboard" className="text-violet-400 hover:text-violet-300">Return to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0f0f1a] text-white">
      <header className="border-b border-white/10 p-6">
        <Link to="/dashboard" className="inline-flex items-center text-sm text-white/50 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Link>
      </header>
      
      <main className="max-w-4xl mx-auto p-6 mt-6">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{tool.name}</h1>
            <p className="font-mono text-sm text-white/40">{tool.toolId} • {tool.category}</p>
          </div>
          <button 
            onClick={handleDeactivate}
            className="flex items-center gap-2 px-4 py-2 bg-red-900/30 text-red-500 hover:bg-red-900/50 rounded-xl transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" /> Deactivate
          </button>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Manifest JSON</h2>
          <pre className="font-mono text-xs text-white/80 bg-black/40 p-4 rounded-xl overflow-x-auto leading-relaxed">
            {JSON.stringify(tool, null, 2)}
          </pre>
        </div>
      </main>
    </div>
  );
}
