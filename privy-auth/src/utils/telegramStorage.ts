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
  const LS_PREFIX = '__tg_cs__';
  const lsGet = (k: string) => localStorage.getItem(LS_PREFIX + k) ?? '';
  const lsSet = (k: string, v: string) => localStorage.setItem(LS_PREFIX + k, v);
  const lsDel = (k: string) => localStorage.removeItem(LS_PREFIX + k);
  const lsKeys = () =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .map((k) => k.slice(LS_PREFIX.length));

  (window as any).Telegram = {
    WebApp: {
      ...(window.Telegram?.WebApp ?? {}),
      CloudStorage: {
        setItem: (k: string, v: string, cb?: (e: null, s: boolean) => void) => { lsSet(k, v); cb?.(null, true); },
        getItem: (k: string, cb: (e: null, v: string) => void) => cb(null, lsGet(k)),
        getItems: (ks: string[], cb: (e: null, v: Record<string, string>) => void) => cb(null, Object.fromEntries(ks.map(k => [k, lsGet(k)]))),
        removeItem: (k: string, cb?: (e: null, r: boolean) => void) => { lsDel(k); cb?.(null, true); },
        getKeys: (cb: (e: null, ks: string[]) => void) => cb(null, lsKeys()),
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
