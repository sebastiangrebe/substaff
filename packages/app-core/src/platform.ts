export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RequestFn {
  <T>(path: string, init?: RequestInit): Promise<T>;
}
