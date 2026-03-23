import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StorageAdapter } from "@substaff/app-core/platform";

/**
 * AsyncStorage-backed StorageAdapter with synchronous in-memory cache.
 * Call initialize() during splash screen before rendering providers.
 */
export class NativeStorage implements StorageAdapter {
  private cache = new Map<string, string>();

  async initialize() {
    const keys = await AsyncStorage.getAllKeys();
    const entries = await AsyncStorage.multiGet(keys);
    for (const [key, value] of entries) {
      if (value !== null) this.cache.set(key, value);
    }
  }

  getItem(key: string) {
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.cache.set(key, value);
    AsyncStorage.setItem(key, value);
  }

  removeItem(key: string) {
    this.cache.delete(key);
    AsyncStorage.removeItem(key);
  }
}
