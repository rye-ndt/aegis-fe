// JSON wrappers over crypto.encryptBlob/decryptBlob (AES-GCM + PBKDF2).
// Same on-the-wire byte layout as the raw-string `delegated_key` blob.

import { encryptBlob, decryptBlob } from './crypto';

export async function encryptJson<T>(value: T, password: string): Promise<string> {
  return encryptBlob(JSON.stringify(value), password);
}

export async function decryptJson<T>(blob: string, password: string): Promise<T> {
  const plain = await decryptBlob(blob, password);
  return JSON.parse(plain) as T;
}
