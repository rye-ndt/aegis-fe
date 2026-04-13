// CloudStorage requires Telegram WebApp v6.9+. Install an in-memory mock when:
//   - CloudStorage is absent entirely (dev browser, non-Telegram context), OR
//   - the runtime version is below 6.9 (stub object present but callbacks never fire)
function cloudStorageSupported(): boolean {
  const cs = window.Telegram?.WebApp?.CloudStorage;
  if (!cs) return false;
  const version = parseFloat(window.Telegram?.WebApp?.version ?? '0');
  return version >= 6.9;
}

if (!cloudStorageSupported()) {
  const store = new Map<string, string>();
  (window as any).Telegram = {
    WebApp: {
      ...(window.Telegram?.WebApp ?? {}),
      CloudStorage: {
        setItem: (k: string, v: string, cb?: (e: null, s: boolean) => void) => { store.set(k, v); cb?.(null, true); },
        getItem: (k: string, cb: (e: null, v: string) => void) => cb(null, store.get(k) ?? ''),
        getItems: (ks: string[], cb: (e: null, v: Record<string, string>) => void) => cb(null, Object.fromEntries(ks.map(k => [k, store.get(k) ?? '']))),
        removeItem: (k: string, cb?: (e: null, r: boolean) => void) => { store.delete(k); cb?.(null, true); },
        getKeys: (cb: (e: null, ks: string[]) => void) => cb(null, [...store.keys()]),
      },
    },
  };
}

function getCloudStorage(): TelegramCloudStorage {
  const cs = window.Telegram?.WebApp?.CloudStorage;
  if (!cs) {
    throw new Error(
      'Telegram CloudStorage is not available. This app must run inside Telegram.',
    );
  }
  return cs;
}

export function cloudStorageGetItem(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    getCloudStorage().getItem(key, (error, value) => {
      if (error) return reject(new Error(error));
      resolve(value === '' ? null : value);
    });
  });
}

export function cloudStorageSetItem(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getCloudStorage().setItem(key, value, (error, stored) => {
      if (error) return reject(new Error(error));
      if (!stored) return reject(new Error(`CloudStorage refused to store key "${key}"`));
      resolve();
    });
  });
}
