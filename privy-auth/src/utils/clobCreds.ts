// CLOB credentials live only on the device — encrypted with the same
// AES-GCM+PBKDF2 scheme as `delegated_key` (BLOCKER-2 carry-over: the
// password is privyDid). Never transmitted to BE.

import { encryptJson, decryptJson } from './encryptedCloudStorage';
import {
  cloudStorageGetItem,
  cloudStorageSetItem,
  cloudStorageRemoveItem,
} from './telegramStorage';
import { polymarketClobCredsKey, listAllManagedKeys, DELEGATED_KEY } from './cloudStorageKeys';
import { createLogger } from './logger';

const log = createLogger('clobCreds');

export interface ClobCreds {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export async function saveClobCreds(
  chainId: number,
  creds: ClobCreds,
  password: string,
): Promise<void> {
  const blob = await encryptJson(creds, password);
  await cloudStorageSetItem(polymarketClobCredsKey(chainId), blob);
  log.debug('saved', { chainId });
}

export async function loadClobCreds(
  chainId: number,
  password: string,
): Promise<ClobCreds | null> {
  const blob = await cloudStorageGetItem(polymarketClobCredsKey(chainId));
  if (!blob) {
    log.debug('miss', { chainId });
    return null;
  }
  try {
    const creds = await decryptJson<ClobCreds>(blob, password);
    log.debug('hit', { chainId });
    return creds;
  } catch (err) {
    log.warn('decrypt-failed', { chainId, err: String(err) });
    return null;
  }
}

// Per-key failures are logged but never thrown — disconnect must always
// finish locally even if one Telegram removeItem hangs.
export async function wipeAllManagedSecrets(): Promise<void> {
  await Promise.all(
    listAllManagedKeys()
      .filter((key) => key !== DELEGATED_KEY)
      .map(async (key) => {
        try {
          await cloudStorageRemoveItem(key);
          log.debug('wiped', { key });
        } catch (err) {
          log.warn('wipe-failed', { key, err: String(err) });
        }
      }),
  );
}
