import { View, Text, ScrollView, RefreshControl, FlatList, TouchableOpacity } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { timeAgo } from "@substaff/app-core/utils/timeAgo";
import { useApi } from "../../../hooks/useApi";
import { useCompany } from "../../../hooks/useCompany";
import { useState } from "react";
import { StatusBadge } from "../../../components/shared/StatusBadge";
import { StatusIcon } from "../../../components/shared/StatusIcon";
import { PriorityIcon } from "../../../components/shared/PriorityIcon";
import { Separator } from "../../../components/ui/separator";
import { Skeleton } from "../../../components/ui/skeleton";
import type { Issue } from "@substaff/shared";

export default function ProjectDetailScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { projectsApi, issuesApi } = useApi();
  const { selectedCompanyId } = useCompany();
  const [refreshing, setRefreshing] = useState(false);

  const companyId = selectedCompanyId ?? "";

  const { data: project, refetch } = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => projectsApi.get(projectId, companyId),
    enabled: !!projectId,
  });

  const { data: progress } = useQuery({
    queryKey: queryKeys.projects.progress(projectId),
    queryFn: () => projectsApi.progress(projectId, companyId),
    enabled: !!projectId,
  });

  const { data: issues = [] } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId && !!projectId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  if (!project) {
    return (
      <View className="flex-1 bg-background p-4">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-5 w-64 mb-4" />
        <Skeleton className="h-20 w-full" />
      </View>
    );
  }

  const completionPercent = progress?.completionPercent ?? 0;

  return (
    <>
      <Stack.Screen options={{ title: project.name, headerBackTitle: "Projects" }} />
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="p-4">
          {/* Header */}
          <View className="flex-row items-start justify-between mb-2">
            <Text className="text-xl font-bold text-foreground flex-1">{project.name}</Text>
            <StatusBadge status={project.status} />
          </View>

          {project.description ? (
            <Text className="text-sm text-foreground mb-4 leading-relaxed">{project.description}</Text>
          ) : null}

          {/* Progress */}
          <View className="bg-card border border-border rounded-lg p-4 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-foreground">Progress</Text>
              <Text className="text-sm font-semibold text-foreground">{completionPercent}%</Text>
            </View>
            <View className="h-2 bg-muted rounded-full overflow-hidden">
              <View
                className={`h-full rounded-full ${completionPercent >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                style={{ width: `${Math.min(completionPercent, 100)}%` }}
              />
            </View>
            {progress && (
              <View className="flex-row gap-4 mt-3">
                <Text className="text-xs text-muted-foreground">{progress.issues?.open ?? 0} open</Text>
                <Text className="text-xs text-muted-foreground">{progress.issues?.inProgress ?? 0} in progress</Text>
                <Text className="text-xs text-muted-foreground">{progress.issues?.done ?? 0} done</Text>
              </View>
            )}
          </View>

          {/* Issues */}
          {issues.length > 0 && (
            <View>
              <Text className="text-base font-semibold text-foreground mb-3">
                Issues ({issues.length})
              </Text>
              {issues.map((issue: Issue) => (
                <TouchableOpacity
                  key={issue.id}
                  className="bg-card border border-border rounded-lg p-3 mb-2"
                  onPress={() => router.push(`/(app)/issues/${issue.id}`)}
                >
                  <View className="flex-row items-center gap-2 mb-1">
                    <StatusIcon status={issue.status} />
                    <Text className="text-xs text-muted-foreground font-mono">
                      {issue.identifier ?? issue.id.slice(0, 8)}
                    </Text>
                    <PriorityIcon priority={issue.priority} size={12} />
                  </View>
                  <Text className="text-sm text-foreground" numberOfLines={1}>{issue.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}
