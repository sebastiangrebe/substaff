import { View, Text, ScrollView, RefreshControl, Alert } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { formatCents } from "@substaff/app-core/utils/format";
import { timeAgo } from "@substaff/app-core/utils/timeAgo";
import { agentRoleLabel, formatLabel } from "@substaff/app-core/utils/labels";
import { useApi } from "../../../hooks/useApi";
import { useCompany } from "../../../hooks/useCompany";
import { useState } from "react";
import { StatusBadge } from "../../../components/shared/StatusBadge";
import { MetricCard } from "../../../components/shared/MetricCard";
import { Separator } from "../../../components/ui/separator";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Play,
  Pause,
  Activity,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react-native";

export default function AgentDetailScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const { agentsApi, heartbeatsApi } = useApi();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const companyId = selectedCompanyId ?? "";

  const { data: agent, refetch } = useQuery({
    queryKey: queryKeys.agents.detail(agentId),
    queryFn: () => agentsApi.get(agentId, companyId),
    enabled: !!agentId,
  });

  const { data: runs = [] } = useQuery({
    queryKey: queryKeys.heartbeats(companyId, agentId),
    queryFn: () => heartbeatsApi.list(companyId, agentId, 10),
    enabled: !!companyId && !!agentId,
  });

  const pauseMutation = useMutation({
    mutationFn: () => agentsApi.pause(agentId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => agentsApi.resume(agentId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
    },
  });

  const invokeMutation = useMutation({
    mutationFn: () => agentsApi.invoke(agentId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(companyId, agentId) });
      Alert.alert("Success", "Agent heartbeat triggered");
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(companyId, agentId) }),
    ]);
    setRefreshing(false);
  }

  if (!agent) {
    return (
      <View className="flex-1 bg-background p-4">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-24 w-full mb-3" />
        <Skeleton className="h-24 w-full" />
      </View>
    );
  }

  const roleDisplay = agent.role ? (agentRoleLabel[agent.role] ?? formatLabel(agent.role)) : null;
  const succeededRuns = runs.filter((r) => r.status === "succeeded").length;
  const successRate = runs.length > 0 ? Math.round((succeededRuns / runs.length) * 100) : 0;
  const isPaused = agent.status === "paused";
  const isTerminated = agent.status === "terminated";

  return (
    <>
      <Stack.Screen options={{ title: agent.name, headerBackTitle: "Agents" }} />
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="p-4">
          {/* Header */}
          <View className="flex-row items-start justify-between mb-1">
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{agent.name}</Text>
              {agent.title ? (
                <Text className="text-muted-foreground text-sm mt-0.5">{agent.title}</Text>
              ) : null}
            </View>
            <StatusBadge status={agent.status} showDot />
          </View>

          {/* Role & adapter */}
          <View className="flex-row items-center gap-2 mt-2 mb-4">
            {roleDisplay && (
              <Text className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                {roleDisplay}
              </Text>
            )}
            <Text className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              {agent.adapterType}
            </Text>
          </View>

          {/* Action buttons */}
          {!isTerminated && (
            <View className="flex-row gap-2 mb-4">
              {isPaused ? (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                  className="flex-1"
                >
                  <View className="flex-row items-center gap-1.5">
                    <Play size={14} color="#18181b" />
                    <Text className="text-sm font-medium text-foreground">Resume</Text>
                  </View>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => pauseMutation.mutate()}
                  disabled={pauseMutation.isPending}
                  className="flex-1"
                >
                  <View className="flex-row items-center gap-1.5">
                    <Pause size={14} color="#18181b" />
                    <Text className="text-sm font-medium text-foreground">Pause</Text>
                  </View>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onPress={() => invokeMutation.mutate()}
                disabled={invokeMutation.isPending}
                className="flex-1"
              >
                <View className="flex-row items-center gap-1.5">
                  <Zap size={14} color="#18181b" />
                  <Text className="text-sm font-medium text-foreground">Run Now</Text>
                </View>
              </Button>
            </View>
          )}

          {/* Stats */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <MetricCard
                icon={Activity}
                value={runs.length}
                label="Total Runs"
              />
            </View>
            <View className="flex-1">
              <MetricCard
                icon={CheckCircle2}
                value={`${successRate}%`}
                label="Success Rate"
              />
            </View>
          </View>

          {/* Capabilities */}
          {agent.capabilities ? (
            <View className="bg-card border border-border rounded-lg p-4 mb-4">
              <Text className="text-sm font-semibold text-foreground mb-2">Capabilities</Text>
              <Text className="text-sm text-foreground leading-relaxed">{agent.capabilities}</Text>
            </View>
          ) : null}

          {/* Recent runs */}
          {runs.length > 0 && (
            <View className="mb-4">
              <Text className="text-base font-semibold text-foreground mb-3">Recent Runs</Text>
              {runs.slice(0, 5).map((run) => (
                <View key={run.id} className="bg-card border border-border rounded-lg p-3 mb-2">
                  <View className="flex-row items-center justify-between mb-1">
                    <StatusBadge status={run.status} />
                    <Text className="text-xs text-muted-foreground">
                      {timeAgo(run.createdAt)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2 mt-1">
                    <Text className="text-xs text-muted-foreground capitalize">
                      {run.invocationSource?.replace(/_/g, " ") ?? "manual"}
                    </Text>
                    {run.startedAt && run.finishedAt && (
                      <>
                        <Text className="text-xs text-muted-foreground">·</Text>
                        <Text className="text-xs text-muted-foreground">
                          {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}
