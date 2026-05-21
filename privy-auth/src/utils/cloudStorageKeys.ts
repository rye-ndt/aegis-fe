// Convention: every per-protocol secret blob MUST register its key here so
// `useDelegatedKey.removeKey` wipes it on disconnect. Prevents stale creds
// blobs silently surviving a "Remove key".

import { POLYMARKET_CHAIN_ID } from './polymarket';

export const DELEGATED_KEY = 'delegated_key';

export const polymarketClobCredsKey = (chainId: number) =>
  `polymarket_clob_creds_${chainId}`;

const POLYMARKET_CHAIN_IDS: readonly number[] = [POLYMARKET_CHAIN_ID];

export function listAllManagedKeys(): string[] {
  return [
    DELEGATED_KEY,
    ...POLYMARKET_CHAIN_IDS.map(polymarketClobCredsKey),
  ];
}
