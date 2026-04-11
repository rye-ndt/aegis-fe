import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toolManifestSchema } from '../utils/schemas';
import { publishTool, type ToolManifest } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';

const CATEGORY_TEMPLATES = {
  swap: JSON.stringify({
    type: "object",
    required: ["fromTokenSymbol", "toTokenSymbol", "amountHuman"],
    properties: {
      fromTokenSymbol: { type: "string", description: "Token to swap from, e.g. USDC" },
      toTokenSymbol: { type: "string", description: "Token to receive, e.g. AVAX" },
      amountHuman: { type: "string", description: "Amount in human units, e.g. 100" },
      slippageBps: { type: "number", description: "Slippage tolerance in basis points" }
    }
  }, null, 2),
  erc20_transfer: JSON.stringify({
    type: "object",
    required: ["tokenAddress", "amountRaw"],
    properties: {
      tokenAddress: { type: "string", description: "ERC-20 contract address" },
      amountRaw: { type: "string", description: "Amount in smallest unit (e.g. wei)" }
    }
  }, null, 2),
  contract_interaction: JSON.stringify({
    type: "object",
    required: [],
    properties: {}
  }, null, 2)
};

export function ToolBuilder() {
  const { token, userId } = useAuth();
  const [successStatus, setSuccessStatus] = useState<{ id: string, indexed: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(toolManifestSchema),
    defaultValues: {
      toolId: '',
      name: '',
      protocolName: '',
      category: 'contract_interaction',
      description: '',
      tags: '',
      chainIds: [43113],
      priority: 0,
      isDefault: false,
      revenueWallet: '',
      inputSchemaString: CATEGORY_TEMPLATES.contract_interaction,
      steps: [{ kind: 'abi_encode', name: 'encode' }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "steps"
  });

  const watchAll = watch();

  useEffect(() => {
    // Auto-update schema template if pristine? No, only on explicit reset. 
    // Simply to not overwrite user edits. Let's just do it on first mount.
  }, []);

  const onSubmit = async (data: any) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const manifest: ToolManifest = {
        ...data,
        tags: data.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        inputSchema: JSON.parse(data.inputSchemaString)
      };

      const res = await publishTool(manifest, token);
      
      // Update local storage ownership
      try {
        const cacheRaw = localStorage.getItem(`aegis_owned_${userId}`);
        const cache = cacheRaw ? JSON.parse(cacheRaw) : [];
        cache.push(res.toolId);
        localStorage.setItem(`aegis_owned_${userId}`, JSON.stringify(cache));
      } catch (e) {}

      setSuccessStatus({ id: res.toolId, indexed: !!res.indexed });
    } catch (err: any) {
      if (err.message === "TOOL_ID_TAKEN") {
        setSubmitError("That Tool ID is already registered globally.");
      } else {
        setSubmitError("Failed to register tool. " + err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (successStatus) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0f0f1a] text-white">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Tool Published!</h2>
          <p className="text-white/60 mb-6">Your tool '{watchAll.name}' has been successfully registered.</p>
          
          {successStatus.indexed === false && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-sm p-4 rounded-xl mb-6 flex items-start text-left">
              <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
              <p>Tool registered. Semantic search indexing failed — it may take longer to appear in AI suggestions.</p>
            </div>
          )}

          <div className="flex gap-4">
            <Link to="/dashboard" className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors font-medium">Dashboard</Link>
            <Link to={`/tools/${successStatus.id}`} className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors font-medium">View JSON</Link>
          </div>
        </div>
      </div>
    );
  }

  // Calculate live JSON for the Preview Panel
  let liveJson = {};
  try {
    liveJson = {
      ...watchAll,
      tags: watchAll.tags ? watchAll.tags.split(',').map((t: string) => t.trim()) : [],
      inputSchema: watchAll.inputSchemaString ? JSON.parse(watchAll.inputSchemaString) : {}
    };
  } catch(e) {}

  return (
    <div className="min-h-dvh bg-transparent text-white flex flex-col md:flex-row relative z-0">
      <div className="w-full md:w-2/3 border-r border-white/5 flex flex-col h-dvh overflow-y-auto custom-scrollbar">
        <header className="border-b border-white/5 p-6 flex items-center sticky top-0 bg-white/[0.01] backdrop-blur-xl z-20">
          <Link to="/dashboard" className="text-white/50 hover:text-white mr-4 transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">Build New Tool</h1>
        </header>
        
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 max-w-3xl space-y-10">
          {submitError && (
             <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl">
               {submitError}
             </div>
          )}

          {/* Identity Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4 bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent">1. Identity</h2>
            <div className="space-y-5 bg-white/[0.02] backdrop-blur-sm p-6 rounded-2xl border border-white/5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 blur-[80px] rounded-full pointer-events-none" />
              <div className="grid grid-cols-2 gap-5 relative z-10">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Tool ID</label>
                  <input {...register('toolId')} onChange={(e) => {
                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                    setValue('toolId', slug);
                  }} className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-2.5 text-sm focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30 outline-none" placeholder="e.g. pangolin-swap" />
                  {errors.toolId && <p className="text-red-400 text-xs mt-1">{errors.toolId.message as string}</p>}
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Display Name</label>
                  <input {...register('name')} className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-2.5 text-sm focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30 outline-none" placeholder="e.g. Pangolin V2 Swap" />
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message as string}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Protocol Name</label>
                  <input {...register('protocolName')} className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-2.5 text-sm focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30 outline-none" placeholder="Pangolin" />
                  {errors.protocolName && <p className="text-red-400 text-xs mt-1">{errors.protocolName.message as string}</p>}
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Category</label>
                  <select {...register('category')} onChange={(e) => {
                    setValue('category', e.target.value);
                    setValue('inputSchemaString', CATEGORY_TEMPLATES[e.target.value as keyof typeof CATEGORY_TEMPLATES]);
                  }} className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-2.5 text-sm focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30 outline-none">
                    <option value="contract_interaction">Contract Interaction</option>
                    <option value="swap">Swap</option>
                    <option value="erc20_transfer">ERC-20 Transfer</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Description (Be descriptive for the AI)</label>
                <textarea {...register('description')} rows={3} className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-2.5 text-sm focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30 outline-none" placeholder="Use this when the user wants to swap tokens on Pangolin..." />
                {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message as string}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Tags (Comma separated)</label>
                  <input {...register('tags')} className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-2.5 text-sm focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30 outline-none" placeholder="swap, avax, dex" />
                  {errors.tags && <p className="text-red-400 text-xs mt-1">{errors.tags.message as string}</p>}
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Revenue Wallet (0x...)</label>
                  <input {...register('revenueWallet')} className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-2.5 text-sm focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30 outline-none" placeholder="0x..." />
                  {errors.revenueWallet && <p className="text-red-400 text-xs mt-1">{errors.revenueWallet.message as string}</p>}
                </div>
              </div>
            </div>
          </section>

          {/* Input Schema */}
          <section>
            <h2 className="text-lg font-semibold mb-4 bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent">2. Input Schema</h2>
            <div className="bg-[#0a0a10]/80 rounded-2xl border border-white/5 overflow-hidden shadow-inner flex flex-col">
              <div className="flex bg-white/[0.02] border-b border-white/5 px-4 py-2 mt-0">
                 <span className="text-[10px] uppercase tracking-widest text-violet-400 font-semibold shadow-[0_0_8px_rgba(167,139,250,0.3)]">Draft Format</span>
              </div>
              <CodeMirror
                value={watchAll.inputSchemaString}
                height="200px"
                extensions={[json()]}
                theme="dark"
                onChange={(val) => setValue('inputSchemaString', val)}
              />
            </div>
            {errors.inputSchemaString && <p className="text-red-400 text-xs mt-1">{errors.inputSchemaString.message as string}</p>}
          </section>

          {/* Steps Pipeline */}
          <section>
            <div className="flex justify-between items-end mb-4">
              <h2 className="text-lg font-semibold text-violet-400">3. Steps Pipeline</h2>
              <span className="text-xs text-white/40">Executed top to bottom</span>
            </div>
            {errors.steps?.root && <p className="text-red-400 text-sm mb-4 bg-red-500/10 p-3 rounded-lg">{errors.steps.root.message}</p>}

            <div className="space-y-4">
              {fields.map((field, index) => {
                const stepKind = watchAll.steps[index]?.kind;
                const fieldErr = errors.steps?.[index] as any;
                return (
                  <div key={field.id} className="bg-white/5 border border-white/10 rounded-xl p-4 relative group">
                    <button type="button" onClick={() => remove(index)} className="absolute top-4 right-4 text-white/30 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="grid grid-cols-2 gap-4 mr-8 mb-4">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-violet-300/70 mb-1.5 font-medium">Step Name</label>
                        <input {...register(`steps.${index}.name`)} className="bg-white/[0.02] border border-white/10 rounded-xl px-3 py-2 text-sm outline-none w-full focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30" placeholder="e.g. getQuote" />
                        {fieldErr?.name && <p className="text-red-400 text-xs mt-1">{fieldErr.name.message}</p>}
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-violet-300/70 mb-1.5 font-medium">Kind</label>
                        <select {...register(`steps.${index}.kind`)} className="bg-white/[0.02] border border-white/10 rounded-xl px-3 py-2 text-sm outline-none w-full text-white focus:border-violet-500/50 focus:bg-white/[0.05] transition-all focus:ring-1 focus:ring-violet-500/30">
                          <option value="http_get">HTTP GET</option>
                          <option value="http_post">HTTP POST</option>
                          <option value="abi_encode">ABI Encode</option>
                          <option value="calldata_passthrough">Calldata Passthrough</option>
                          <option value="erc20_transfer">ERC20 Transfer</option>
                        </select>
                        {fieldErr?.kind && <p className="text-red-400 text-xs">{fieldErr.kind.message}</p>}
                      </div>
                    </div>

                    {/* Step specific UI mockups (simplified for space) */}
                    {(stepKind === 'http_get' || stepKind === 'http_post') && (
                      <div className="space-y-2">
                         <input {...register(`steps.${index}.url` as any)} className="w-full bg-black/40 border whitespace-pre-wrap border-white/10 rounded lg p-2 text-sm outline-none font-mono" placeholder="https://api.example.com?token={{intent.params.symbol}}" />
                      </div>
                    )}
                    {stepKind === 'abi_encode' && (
                      <div className="space-y-2">
                        <input {...register(`steps.${index}.contractAddress` as any)} className="w-full bg-black/40 border border-white/10 rounded lg p-2 text-sm outline-none font-mono" placeholder="Contract Address (0x...)" />
                        {fieldErr?.contractAddress && <p className="text-red-400 text-xs">{fieldErr.contractAddress.message}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => append({ kind: 'http_get', name: `step_${fields.length + 1}` })} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-sm rounded-lg flex items-center transition-colors">
                <Plus className="w-4 h-4 mr-1" /> Add Step
              </button>
            </div>
          </section>

          <footer className="pt-8 mb-20 flex justify-end">
            <button type="submit" disabled={submitting} className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium py-3 px-8 rounded-xl transition-all">
              {submitting ? 'Publishing...' : 'Publish Tool Manifest'}
            </button>
          </footer>
        </form>
      </div>

      {/* Live Preview Panel */}
      <div className="hidden md:flex flex-col w-1/3 bg-transparent border-l border-white/5 h-dvh sticky top-0 backdrop-blur-sm">
        <div className="p-4 border-b border-white/5 bg-white/[0.01]">
          <h2 className="text-xs font-bold uppercase tracking-widest text-violet-300">Live Manifest Preview</h2>
        </div>
        <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-black/20">
          <CodeMirror
            value={JSON.stringify(liveJson, null, 2)}
            height="100%"
            extensions={[json()]}
            theme="dark"
            readOnly={true}
            basicSetup={{ lineNumbers: false, foldGutter: false }}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}
