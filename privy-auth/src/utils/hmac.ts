// HMAC-SHA256, base64-decoded key in, base64url out. Matches Polymarket
// CLOB's L2 signing scheme. Throws early if SubtleCrypto is missing so the
// error pipeline catches it instead of signing an empty buffer.

import { createLogger } from './logger';

const log = createLogger('hmac');

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    log.warn('hmac-platform-unsupported', {
      platform: (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent,
    });
    throw new Error('SubtleCrypto unavailable — HMAC signing not supported on this platform');
  }
  const keyBytes = base64ToBytes(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message) as BufferSource,
  );
  return bytesToBase64Url(new Uint8Array(sig));
}
