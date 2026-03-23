import "../global.css";
import { useEffect, useState } from "react";
import { View, Text, AppState } from "react-native";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { CompanyProvider } from "../hooks/useCompany";
import { useOnlineManager, useOnlineStatus } from "../hooks/useOnlineStatus";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { restoreQueryCache, persistQueryCache } from "../lib/queryPersister";
import { initSentry } from "../lib/sentry";

// Initialize Sentry before any rendering
initSentry();

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60, // Keep unused data for 1 hour (for offline)
    },
  },
});

// Refetch queries when app returns to foreground
function useAppStateRefetch() {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });
    return () => subscription.remove();
  }, []);
}

// Persist query cache when app goes to background
function useCachePersistence() {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "background" || status === "inactive") {
        persistQueryCache(queryClient);
      }
    });
    return () => subscription.remove();
  }, []);
}

function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <View className="bg-amber-500 px-4 py-1.5">
      <Text className="text-white text-xs font-medium text-center">
        You're offline — showing cached data
      </Text>
    </View>
  );
}

export default function RootLayout() {
  const [cacheRestored, setCacheRestored] = useState(false);

  // Restore cached data during splash screen
  useEffect(() => {
    restoreQueryCache(queryClient).finally(() => {
      setCacheRestored(true);
      SplashScreen.hideAsync();
    });
  }, []);

  // OTA update check
  useEffect(() => {
    if (__DEV__) return;
    Updates.checkForUpdateAsync().then(({ isAvailable }) => {
      if (isAvailable) {
        Updates.fetchUpdateAsync().then(() => Updates.reloadAsync());
      }
    }).catch(() => {
      // Silently fail — OTA is best-effort
    });
  }, []);

  useOnlineManager();
  useAppStateRefetch();
  useCachePersistence();
  usePushNotifications();

  if (!cacheRestored) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <CompanyProvider>
        <StatusBar style="auto" />
        <OfflineBanner />
        <Slot />
      </CompanyProvider>
    </QueryClientProvider>
  );
}
