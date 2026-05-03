import { entryPoint07Address } from 'viem/account-abstraction';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';

// MUST match be/src/helpers/aaConfig.ts AA_CONFIG.
// Pinned to 0n; verified against Privy's hosted-Kernel default.
export const AA_CONFIG = {
  entryPointVersion: '0.7' as const,
  entryPointAddress: entryPoint07Address,
  kernelVersion: KERNEL_V3_1,
  index: 0n,
} as const;

export function getAaEntryPoint() {
  return getEntryPoint(AA_CONFIG.entryPointVersion);
}
