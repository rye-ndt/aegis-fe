import { addressToEmptyAccount, createKernelAccount } from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { createPublicClient, http } from 'viem';
import { AA_CONFIG, getAaEntryPoint } from './aaConfig';
import { getChain, getRpcUrl } from './chainConfig';
import { createLogger } from './logger';

const log = createLogger('deriveScaAddress');

const cache = new Map<string, `0x${string}`>();

export async function deriveScaAddress(
  eoa: `0x${string}`,
): Promise<`0x${string}`> {
  const chain = getChain();
  const cacheKey = `${chain.id}:${eoa.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    log.debug('cache hit', { eoa, sca: cached });
    return cached;
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl()),
  });
  const entryPoint = getAaEntryPoint();
  const ownerSigner = addressToEmptyAccount(eoa);
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    entryPoint,
    signer: ownerSigner,
    kernelVersion: AA_CONFIG.kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: { sudo: ecdsaValidator },
    kernelVersion: AA_CONFIG.kernelVersion,
    index: AA_CONFIG.index,
  });

  const sca = account.address as `0x${string}`;
  cache.set(cacheKey, sca);
  log.debug('sca-derived', { eoa, sca });
  return sca;
}
