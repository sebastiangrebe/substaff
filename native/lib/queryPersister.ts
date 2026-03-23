/**
 * Persist TanStack Query cache to AsyncStorage for offline support.
 * On app launch, previously cached data is restored so screens show
 * stale data immediately while fresh data loads in the background.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";

const CACHE_KEY = "substaff.query-cache";
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24 hours

interface PersistedQuery {
  queryHash: string;
  queryKey: unknown[];
  state: {
    data: unknown;
    dataUpdatedAt: number;
  };
}

/**
 * Restore cached queries from AsyncStorage into the QueryClient.
 * Only restores queries whose data is less than MAX_AGE_MS old.
 */
export async function restoreQueryCache(queryClient: QueryClient) {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;

    const entries: PersistedQuery[] = JSON.parse(raw);
    const now = Date.now();

    for (const entry of entries) {
      if (now - entry.state.dataUpdatedAt > MAX_AGE_MS) continue;
      queryClient.setQueryData(entry.queryKey, entry.state.data, {
        updatedAt: entry.state.dataUpdatedAt,
      });
    }
  } catch {
    // Silently fail — cache restoration is best-effort
  }
}

/**
 * Persist the current query cache to AsyncStorage.
 * Only persists queries that have data and are not stale beyond MAX_AGE.
 */
export async function persistQueryCache(queryClient: QueryClient) {
  try {
    const now = Date.now();
    const cache = queryClient.getQueryCache().getAll();

    const entries: PersistedQuery[] = [];
    for (const query of cache) {
      if (!query.state.data) continue;
      if (now - query.state.dataUpdatedAt > MAX_AGE_MS) continue;
      // Skip large data sets and binary data
      const serialized = JSON.stringify(query.state.data);
      if (serialized.length > 100_000) continue;

      entries.push({
        queryHash: query.queryHash,
        queryKey: query.queryKey as unknown[],
        state: {
          data: query.state.data,
          dataUpdatedAt: query.state.dataUpdatedAt,
        },
      });
    }

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Silently fail — cache persistence is best-effort
  }
}
