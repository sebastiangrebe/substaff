/**
 * Network connectivity awareness.
 * Pauses query refetching when offline and resumes on reconnection.
 */

import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";

export function useOnlineManager() {
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected !== false && state.isInternetReachable !== false;
      onlineManager.setOnline(isConnected);
    });
  }, []);
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false && state.isInternetReachable !== false;
      setIsOnline(connected);
    });
  }, []);

  return isOnline;
}
