/**
 * WebSocket live updates for the native app.
 * Connects to the server's live events WebSocket and invalidates
 * TanStack Query caches when events arrive.
 */

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { queryKeys } from "@substaff/app-core/queries";
import type { LiveEvent } from "@substaff/shared";

const EVENT_DEDUP_WINDOW_MS = 500;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function invalidateHeartbeatQueries(
  queryClient: QueryClient,
  companyId: string,
  payload: Record<string, unknown>,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId), refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(companyId), refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["costs", companyId], refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(companyId), refetchType: "active" });

  const agentId = readString(payload.agentId);
  if (agentId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(companyId, agentId) });
  }
}

function invalidateActivityQueries(
  queryClient: QueryClient,
  companyId: string,
  payload: Record<string, unknown>,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(companyId), refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(companyId), refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(companyId), refetchType: "active" });

  const entityType = readString(payload.entityType);
  const entityId = readString(payload.entityId);

  if (entityType === "issue") {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId), refetchType: "active" });
    if (entityId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(entityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(entityId), refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(entityId), refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(entityId), refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(entityId), refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(entityId), refetchType: "active" });
    }
    return;
  }

  if (entityType === "agent") {
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId), refetchType: "active" });
    if (entityId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(entityId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(companyId, entityId), refetchType: "active" });
    }
    return;
  }

  if (entityType === "project") {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(companyId), refetchType: "active" });
    if (entityId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(entityId) });
    return;
  }

  if (entityType === "goal") {
    queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(companyId), refetchType: "active" });
    if (entityId) queryClient.invalidateQueries({ queryKey: queryKeys.goals.detail(entityId) });
    return;
  }

  if (entityType === "approval") {
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(companyId), refetchType: "active" });
    return;
  }

  if (entityType === "company") {
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  }
}

function handleLiveEvent(
  queryClient: QueryClient,
  expectedCompanyId: string,
  event: LiveEvent,
  lastInvalidation: Map<string, number>,
) {
  if (event.companyId !== expectedCompanyId) return;

  const payload = event.payload ?? {};

  // Skip log events
  if (event.type === "heartbeat.run.log" || event.type === "heartbeat.run.event") return;

  // Deduplicate rapid-fire events
  const entityId = readString(payload.entityId) ?? readString(payload.agentId) ?? readString(payload.runId) ?? "";
  const dedupKey = `${event.type}:${entityId}`;
  const now = Date.now();
  const lastTime = lastInvalidation.get(dedupKey) ?? 0;
  if (now - lastTime < EVENT_DEDUP_WINDOW_MS) return;
  lastInvalidation.set(dedupKey, now);

  if (event.type === "heartbeat.run.queued" || event.type === "heartbeat.run.status") {
    invalidateHeartbeatQueries(queryClient, expectedCompanyId, payload);
    return;
  }

  if (event.type === "agent.status") {
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(expectedCompanyId), refetchType: "active" });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(expectedCompanyId), refetchType: "active" });
    const agentId = readString(payload.agentId);
    if (agentId) queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
    return;
  }

  if (event.type === "activity.logged") {
    invalidateActivityQueries(queryClient, expectedCompanyId, payload);
  }
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3100/api";

export function useLiveUpdates(companyId: string | null) {
  const queryClient = useQueryClient();
  const lastInvalidationRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!companyId) return;

    let closed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      reconnectAttempt += 1;
      const delayMs = Math.min(15000, 1000 * 2 ** Math.min(reconnectAttempt - 1, 4));
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    const connect = async () => {
      if (closed) return;

      const token = await SecureStore.getItemAsync("substaff.auth.token");
      if (!token) return;

      // Convert http(s) to ws(s)
      const wsBase = API_URL.replace(/^http/, "ws").replace(/\/api$/, "");
      const url = `${wsBase}/api/companies/${encodeURIComponent(companyId)}/events/ws?token=${encodeURIComponent(token)}`;

      socket = new WebSocket(url);

      socket.onopen = () => {
        reconnectAttempt = 0;
      };

      socket.onmessage = (message: WebSocketMessageEvent) => {
        const raw = typeof message.data === "string" ? message.data : "";
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as LiveEvent;
          handleLiveEvent(queryClient, companyId, parsed, lastInvalidationRef.current);
        } catch {
          // Ignore non-JSON payloads
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (closed) return;
        scheduleReconnect();
      };
    };

    connect();

    // Reconnect when app comes back to foreground
    const handleAppState = (state: AppStateStatus) => {
      if (state === "active" && !socket) {
        connect();
      }
    };
    const subscription = AppState.addEventListener("change", handleAppState);

    return () => {
      closed = true;
      clearReconnect();
      subscription.remove();
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, "hook_cleanup");
      }
    };
  }, [queryClient, companyId]);
}
