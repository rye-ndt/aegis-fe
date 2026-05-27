// Branches every queued sign request on the wire-level `primitive`
// discriminator (absent = legacy 'userop'). Caller owns the error pipeline,
// dedupe lookups, and posting `/response`.

import type { Hex, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { SignRequest } from '../../types/miniAppRequest.types';
import { trackInFlightBroadcast } from '../../utils/recentBroadcasts';
import { sendEoaTx } from '../../utils/eoaTxClient';
import { loadClobCreds, saveClobCreds } from '../../utils/clobCreds';
import {
  submitPolymarketOrder,
  deriveClobApiKey,
  POLYMARKET_CLOB_API_BASE,
} from '../../utils/polymarket';
import { bigintRevive } from '../../utils/bigintRevive';
import type { SessionEoa } from '../../utils/sessionEoa';
import type { createSessionKeyClient } from '../../utils/crypto';

type SessionClient = Awaited<ReturnType<typeof createSessionKeyClient>>;

export type DispatchResult =
  | { kind: 'userop' | 'eoa_tx'; hash: Hex }
  | { kind: 'eip712'; signature: Hex; signer: Address; polymarketOrderId?: string };

export interface DispatchSignDeps {
  getSessionClient: (chainId: number) => Promise<SessionClient>;
  loadEoa?: () => Promise<SessionEoa>;
  // Same value used to encrypt `delegated_key` (privyDid today; BLOCKER-2
  // swaps it later). Required for any primitive that touches the session EOA
  // or encrypted CLOB creds blob.
  cloudStoragePassword?: string;
}

export async function dispatchSign(
  req: SignRequest,
  deps: DispatchSignDeps,
): Promise<DispatchResult> {
  const primitive = req.primitive ?? 'userop';
  // chainId is part of the BE contract for every sign request (set by the
  // renderer from the capability's target chain). Fail loud with a precise
  // message instead of letting `undefined` flow into the client builder,
  // which surfaced as the misleading "Chain undefined is not configured".
  if (req.chainId === undefined) {
    throw new Error(`sign request ${req.requestId} is missing chainId (BE contract violation)`);
  }
  const chainId = req.chainId;

  if (primitive === 'userop') {
    const sc = await deps.getSessionClient(chainId);
    const hash = await trackInFlightBroadcast(req.requestId, () =>
      sc.sendTransaction({
        to: req.to as `0x${string}`,
        value: BigInt(req.value),
        data: req.data as `0x${string}`,
        account: sc.account!,
        chain: null,
      }),
    );
    return { kind: 'userop', hash };
  }

  if (primitive === 'eoa_tx') {
    if (!deps.loadEoa) throw new Error('dispatchSign(eoa_tx): loadEoa missing');
    const eoa = await deps.loadEoa();
    const hash = await trackInFlightBroadcast(req.requestId, () =>
      sendEoaTx(
        eoa.privateKey,
        req.to as `0x${string}`,
        req.data as `0x${string}`,
        BigInt(req.value),
        chainId,
      ),
    );
    return { kind: 'eoa_tx', hash };
  }

  // primitive === 'eip712'
  if (!deps.loadEoa) throw new Error('dispatchSign(eip712): loadEoa missing');
  if (!deps.cloudStoragePassword) {
    throw new Error('dispatchSign(eip712): cloudStoragePassword missing');
  }
  if (!req.domain || !req.types || !req.primaryType || !req.message) {
    throw new Error('dispatchSign(eip712): missing typed-data fields');
  }
  // FE refuses to sign past the BE-set window so a mini-app opened long
  // after enqueue can't replay a stale order signature.
  if (req.expiresAt && Date.now() > req.expiresAt) {
    throw new Error(`sign request ${req.requestId} expired at ${new Date(req.expiresAt).toISOString()}`);
  }

  const eoa = await deps.loadEoa();
  const account = privateKeyToAccount(eoa.privateKey);
  const message = bigintRevive(req.message, req.types, req.primaryType);
  const signature = await account.signTypedData({
    domain: req.domain,
    types: req.types,
    primaryType: req.primaryType,
    message,
  });

  if (req.purpose === 'polymarket_order') {
    const creds = await loadClobCreds(chainId, deps.cloudStoragePassword);
    if (!creds) {
      throw new Error('CLOB credentials missing — setup did not complete');
    }
    // The eip712 message *is* an unsigned Polymarket order artifact when
    // purpose='polymarket_order' (BE invariant — verified by the BE's
    // signer-recovery check on /response).
    const polymarketOrderId = await submitPolymarketOrder({
      order: { ...(req.message as Record<string, unknown>), signature } as never,
      creds,
      apiBase: POLYMARKET_CLOB_API_BASE,
    });
    return { kind: 'eip712', signature, signer: account.address, polymarketOrderId };
  }

  // purpose === 'clob_auth'
  const creds = await deriveClobApiKey(POLYMARKET_CLOB_API_BASE, {
    signer: account.address,
    timestamp: String(req.message.timestamp ?? ''),
    nonce: String(req.message.nonce ?? '0'),
    signature,
  });
  await saveClobCreds(chainId, creds, deps.cloudStoragePassword);
  return { kind: 'eip712', signature, signer: account.address };
}
