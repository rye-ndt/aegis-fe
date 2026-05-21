// Raw EVM tx from the session-key EOA. Chain-agnostic — picks chain + RPC
// from chainConfig.

import { createWalletClient, http, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChainById, getRpcUrlById } from './chainConfig';

export async function sendEoaTx(
  privateKey: Hex,
  to: Address,
  data: Hex,
  value: bigint,
  chainId: number,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: getChainById(chainId),
    transport: http(getRpcUrlById(chainId)),
  });
  return client.sendTransaction({ to, data, value });
}
