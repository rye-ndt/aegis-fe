// Telegram WebApp global type declarations
interface TelegramCloudStorageValues {
  [key: string]: string;
}

interface TelegramCloudStorage {
  setItem(
    key: string,
    value: string,
    callback?: (error: string | null, stored: boolean) => void,
  ): void;
  getItem(key: string, callback: (error: string | null, value: string) => void): void;
  getItems(
    keys: string[],
    callback: (error: string | null, values: TelegramCloudStorageValues) => void,
  ): void;
  removeItem(key: string, callback?: (error: string | null, removed: boolean) => void): void;
  getKeys(callback: (error: string | null, keys: string[]) => void): void;
}

interface TelegramWebApp {
  ready(): void
  expand(): void
  close(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  initData: string
  initDataUnsafe: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
      photo_url?: string
      language_code?: string
    }
    start_param?: string
  }
  sendData(data: string): void
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  CloudStorage: TelegramCloudStorage;
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp
  }
}
