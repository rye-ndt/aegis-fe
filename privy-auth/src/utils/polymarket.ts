// FE → Polymarket CLOB integration. Order signing happens generically in
// dispatchSign against the BE-supplied typed data; this module only carries
// the public read/submit surface and the canonical typed-data shape
// constants (kept here so tests and the BE enqueue helpers reference one
// source of truth).

import { parseUnits, toHex } from 'viem';
import type { PolymarketOrderArtifact } from '../types/predictionMarket.types';
import { hmacSign } from './hmac';

export const POLYMARKET_CHAIN_ID = 137;

// FE-only — BE never holds CLOB creds (non-custodial invariant #2). Override
// via VITE_POLYMARKET_CLOB_API for staging / proxy testing.
export const POLYMARKET_CLOB_API_BASE: string =
  (import.meta.env.VITE_POLYMARKET_CLOB_API as string | undefined) ??
  'https://clob.polymarket.com';

// Polymarket `Order` EIP-712 type, mirrored from on-chain CTFExchange
// Signatures.sol. Kept here as a reference shape for tests + manual-confirm
// preview rendering. The actual `req.types` carried on every queued sign
// request is what dispatchSign feeds to viem.signTypedData.
export const POLYMARKET_ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const;

export const POLYMARKET_CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const;

export type OrderSide = 'BUY' | 'SELL';

export function randomSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return BigInt(toHex(bytes)).toString();
}

export function applySlippage(priceBps: number, slippageBps: number, side: OrderSide): number {
  if (side === 'SELL') return Math.max(1, priceBps - slippageBps);
  return Math.min(9999, priceBps + slippageBps);
}

export function sharesForStake(stakeUsdc: string, priceBps: number): string {
  const stake = parseUnits(stakeUsdc, 6);
  if (priceBps <= 0) throw new Error('priceBps must be positive');
  const shares = (stake * 10_000n) / BigInt(priceBps);
  const whole = shares / 1_000_000n;
  const frac = shares % 1_000_000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

interface ClobCreds {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export async function deriveClobApiKey(
  apiBase: string,
  auth: {
    signer: `0x${string}` | string;
    timestamp: string;
    nonce: string;
    signature: `0x${string}` | string;
  },
): Promise<ClobCreds> {
  const r = await fetch(`${apiBase}/auth/api-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      POLY_ADDRESS: auth.signer,
      POLY_SIGNATURE: auth.signature,
      POLY_TIMESTAMP: auth.timestamp,
      POLY_NONCE: auth.nonce,
    },
  });
  if (!r.ok) throw new Error(`clob /auth/api-key → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as Partial<ClobCreds> & { errorMsg?: string };
  if (!j.apiKey || !j.secret || !j.passphrase) {
    throw new Error(`CLOB rejected auth: ${j.errorMsg ?? 'missing apiKey/secret/passphrase'}`);
  }
  return { apiKey: j.apiKey, secret: j.secret, passphrase: j.passphrase };
}

/** Submit a signed Polymarket order directly to clob.polymarket.com using
 *  FE-held HMAC creds. Never goes through BE — non-custodial invariant #2.
 *  Throws on any non-2xx or if the CLOB rejects the order with an errorMsg. */
export async function submitPolymarketOrder(opts: {
  order: PolymarketOrderArtifact;
  creds: ClobCreds;
  apiBase: string;
}): Promise<string /* polymarketOrderId */> {
  const body = JSON.stringify({
    order: opts.order,
    owner: opts.creds.apiKey,
    orderType: 'GTC',
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await hmacSign(opts.creds.secret, `${ts}POST/order${body}`);
  const r = await fetch(`${opts.apiBase}/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      POLY_ADDRESS: opts.order.maker,
      POLY_SIGNATURE: sig,
      POLY_TIMESTAMP: ts,
      POLY_API_KEY: opts.creds.apiKey,
      POLY_PASSPHRASE: opts.creds.passphrase,
    },
    body,
  });
  if (!r.ok) {
    throw new Error(`CLOB /order → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const j = (await r.json()) as { orderID?: string; orderId?: string; errorMsg?: string };
  const id = j.orderID ?? j.orderId;
  if (!id) throw new Error(`CLOB rejected order: ${j.errorMsg ?? 'no orderID in response'}`);
  return id;
}
