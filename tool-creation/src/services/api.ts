// src/services/api.ts

export interface ToolManifest {
  toolId: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  chainIds: number[];
  priority: number;
  isDefault: boolean;
  protocolName: string;
  inputSchema: Record<string, unknown>;
  steps: any[];
  revenueWallet?: string;
  preflightPreview?: {
    label: string;
    valueTemplate: string;
  };
  
  // Backend populated fields
  id?: string;
  createdAt?: number;
  indexed?: boolean;
}

// Memory store for mock data
let mockTools: ToolManifest[] = [
  {
    toolId: 'example-swap-tool',
    name: 'Example Swap Tool',
    category: 'swap',
    description: 'Use this when the user wants to test swapping on the platform natively to interact with the mock data.',
    tags: ['swap', 'dex'],
    chainIds: [43114],
    priority: 0,
    isDefault: false,
    protocolName: 'TestDex',
    inputSchema: { type: "object", required: [], properties: {} },
    steps: [],
    id: 'mock-id-1234',
    createdAt: Date.now() / 1000,
    indexed: true
  }
];



export async function fetchTools() {
  // Mock GET /tools
  return new Promise<{ tools: ToolManifest[] }>((resolve) => setTimeout(() => {
    resolve({ tools: [...mockTools] });
  }, 300));
}

export async function publishTool(manifest: ToolManifest, _token: string | null) {
  // Mock POST /tools
  return new Promise<ToolManifest>((resolve, reject) => setTimeout(() => {
    if (mockTools.some(t => t.toolId === manifest.toolId)) {
      reject(new Error("TOOL_ID_TAKEN"));
      return;
    }
    const newTool = {
      ...manifest,
      id: window.crypto.randomUUID ? window.crypto.randomUUID() : "mock-new-id",
      createdAt: Math.floor(Date.now() / 1000),
      indexed: true
    };
    mockTools.push(newTool);
    resolve(newTool);
  }, 800));
}

export async function deactivateTool(toolId: string, _token: string | null) {
  // Mock DELETE /tools/:toolId
  return new Promise<{toolId: string, deactivated: boolean}>((resolve, reject) => setTimeout(() => {
    const idx = mockTools.findIndex(t => t.toolId === toolId);
    if (idx >= 0) {
      mockTools.splice(idx, 1);
      resolve({ toolId, deactivated: true });
    } else {
      reject(new Error("TOOL_NOT_FOUND"));
    }
  }, 400));
}
