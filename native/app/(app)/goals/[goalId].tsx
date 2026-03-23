import { View, Text, ScrollView, RefreshControl } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { useApi } from "../../../hooks/useApi";
import { useState } from "react";
import { StatusBadge } from "../../../components/shared/StatusBadge";
import { Skeleton } from "../../../components/ui/skeleton";

export default function GoalDetailScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { goalsApi } = useApi();
  const [refreshing, setRefreshing] = useState(false);

  const { data: goal, refetch } = useQuery({
    queryKey: queryKeys.goals.detail(goalId),
    queryFn: () => goalsApi.get(goalId),
    enabled: !!goalId,
  });

  const { data: progress } = useQuery({
    queryKey: queryKeys.goals.progress(goalId),
    queryFn: () => goalsApi.progress(goalId),
    enabled: !!goalId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  if (!goal) {
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
      <Stack.Screen options={{ title: "Goal", headerBackTitle: "Goals" }} />
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="p-4">
          {/* Header */}
          <View className="flex-row items-start justify-between mb-2">
            <Text className="text-xl font-bold text-foreground flex-1">{goal.title}</Text>
            <StatusBadge status={goal.status} />
          </View>

          {goal.description ? (
            <Text className="text-sm text-foreground mb-4 leading-relaxed">{goal.description}</Text>
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

          {/* Metadata */}
          <View className="bg-card border border-border rounded-lg p-4">
            {goal.level && (
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm text-muted-foreground">Level</Text>
                <Text className="text-sm text-foreground capitalize">{goal.level}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </>
  );
}
