import { avalanche, avalancheFuji } from 'viem/chains';
import type { Chain } from 'viem';

const CHAIN_REGISTRY: Record<number, Chain> = {
  43114: avalanche,
  43113: avalancheFuji,
};

const DEFAULT_CHAIN_ID = 43114;

export function getChain(): Chain {
  const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? String(DEFAULT_CHAIN_ID));
  const chain = CHAIN_REGISTRY[chainId];
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);
  return chain;
}

export function getChainId(): number {
  return Number(import.meta.env.VITE_CHAIN_ID ?? String(DEFAULT_CHAIN_ID));
}

export function getRpcUrl(): string {
  const url = import.meta.env.VITE_CHAIN_RPC_URL;
  if (!url) throw new Error('VITE_CHAIN_RPC_URL is not set');
  return url;
}

export function buildExplorerUrl(chainId: number, txHash: string): string {
  const chain = CHAIN_REGISTRY[chainId];
  const baseUrl = chain?.blockExplorers?.default?.url ?? 'https://snowtrace.io';
  return `${baseUrl}/tx/${txHash}`;
}

export function chainName(chainId: number): string {
  return CHAIN_REGISTRY[chainId]?.name ?? `Chain ${chainId}`;
}
