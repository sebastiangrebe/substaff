import { View, Text, ScrollView, RefreshControl, FlatList, TouchableOpacity } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { formatCents } from "@substaff/app-core/utils/format";
import { useApi } from "../../../hooks/useApi";
import { useCompany } from "../../../hooks/useCompany";
import { useState } from "react";
import { router } from "expo-router";
import { MetricCard } from "../../../components/shared/MetricCard";
import { StatusBadge } from "../../../components/shared/StatusBadge";
import { Separator } from "../../../components/ui/separator";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Users,
  ListChecks,
  DollarSign,
  Target,
  AlertTriangle,
  ShieldCheck,
  FolderKanban,
} from "lucide-react-native";
import type { GoalProgress, ProjectProgress } from "@substaff/shared";

export default function DashboardScreen() {
  const { dashboardApi } = useApi();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [refreshing, setRefreshing] = useState(false);

  const companyId = selectedCompanyId ?? "";

  const { data: summary, refetch, isLoading } = useQuery({
    queryKey: queryKeys.dashboard(companyId),
    queryFn: () => dashboardApi.summary(companyId),
    enabled: !!companyId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  if (!companyId) {
    return (
      <View className="flex-1 bg-background justify-center items-center p-6">
        <Text className="text-muted-foreground text-center">
          No company selected
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View className="p-4">
        {/* Header */}
        <Text className="text-2xl font-bold text-foreground mb-1">
          {selectedCompany?.name ?? "Dashboard"}
        </Text>
        {summary && (
          <Text className="text-sm text-muted-foreground mb-4">
            {summary.tasks.inProgress} task{summary.tasks.inProgress !== 1 ? "s" : ""} in progress
            {summary.agents.running > 0 && ` · ${summary.agents.running} agent${summary.agents.running !== 1 ? "s" : ""} working`}
          </Text>
        )}

        {/* Alerts */}
        {summary && summary.pendingApprovals > 0 && (
          <TouchableOpacity
            className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex-row items-center gap-2"
            onPress={() => router.push("/(app)/approvals")}
          >
            <ShieldCheck size={16} color="#d97706" />
            <Text className="text-sm text-amber-700 font-medium flex-1">
              {summary.pendingApprovals} approval{summary.pendingApprovals !== 1 ? "s" : ""} waiting
            </Text>
            <Text className="text-amber-600 text-xs">Review →</Text>
          </TouchableOpacity>
        )}

        {summary && summary.tasks.blocked > 0 && (
          <View className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4 flex-row items-center gap-2">
            <AlertTriangle size={16} color="#e11d48" />
            <Text className="text-sm text-rose-700 font-medium">
              {summary.tasks.blocked} blocked task{summary.tasks.blocked !== 1 ? "s" : ""}
            </Text>
          </View>
        )}

        {/* Metrics Grid */}
        {isLoading ? (
          <View className="gap-3">
            <View className="flex-row gap-3">
              <Skeleton className="flex-1 h-24" />
              <Skeleton className="flex-1 h-24" />
            </View>
            <View className="flex-row gap-3">
              <Skeleton className="flex-1 h-24" />
              <Skeleton className="flex-1 h-24" />
            </View>
          </View>
        ) : summary ? (
          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <MetricCard
                  icon={Users}
                  value={summary.agents.active + summary.agents.running}
                  label="Active Agents"
                  description={summary.agents.running > 0 ? `${summary.agents.running} working now` : undefined}
                  onPress={() => router.push("/(app)/(tabs)/agents")}
                />
              </View>
              <View className="flex-1">
                <MetricCard
                  icon={ListChecks}
                  value={summary.tasks.open + summary.tasks.inProgress}
                  label="Open Tasks"
                  description={`${summary.tasks.done} completed`}
                  onPress={() => router.push("/(app)/(tabs)/issues")}
                />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <MetricCard
                  icon={DollarSign}
                  value={formatCents(summary.costs.monthSpendCents)}
                  label="Monthly Spend"
                  description={
                    summary.costs.monthBudgetCents > 0
                      ? `${summary.costs.monthUtilizationPercent}% of budget`
                      : undefined
                  }
                />
              </View>
              <View className="flex-1">
                <MetricCard
                  icon={Target}
                  value={summary.goals.length}
                  label="Goals"
                  description={
                    summary.goals.filter((g) => g.goalStatus === "active").length > 0
                      ? `${summary.goals.filter((g) => g.goalStatus === "active").length} active`
                      : undefined
                  }
                  onPress={() => router.push("/(app)/goals")}
                />
              </View>
            </View>
          </View>
        ) : null}

        {/* Goals */}
        {summary && summary.goals.length > 0 && (
          <View className="mt-6">
            <Text className="text-base font-semibold text-foreground mb-3">Goals</Text>
            {summary.goals.map((goal) => (
              <TouchableOpacity
                key={goal.goalId}
                className="bg-card border border-border rounded-lg p-4 mb-2"
                onPress={() => router.push(`/(app)/goals/${goal.goalId}`)}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-sm font-medium text-foreground flex-1" numberOfLines={1}>
                    {goal.title}
                  </Text>
                  <StatusBadge status={goal.goalStatus} />
                </View>
                {/* Progress bar */}
                <View className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                  <View
                    className={`h-full rounded-full ${goal.completionPercent >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${Math.min(goal.completionPercent, 100)}%` }}
                  />
                </View>
                <Text className="text-xs text-muted-foreground mt-1">
                  {goal.completionPercent}% · {goal.issues.done}/{goal.issues.total} tasks
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Projects */}
        {summary && summary.projects.length > 0 && (
          <View className="mt-6">
            <Text className="text-base font-semibold text-foreground mb-3">Projects</Text>
            {summary.projects.map((project) => (
              <TouchableOpacity
                key={project.projectId}
                className="bg-card border border-border rounded-lg p-4 mb-2"
                onPress={() => router.push(`/(app)/projects/${project.projectId}`)}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-sm font-medium text-foreground flex-1" numberOfLines={1}>
                    {project.name}
                  </Text>
                  <StatusBadge status={project.status} />
                </View>
                <View className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                  <View
                    className={`h-full rounded-full ${project.completionPercent >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${Math.min(project.completionPercent, 100)}%` }}
                  />
                </View>
                <Text className="text-xs text-muted-foreground mt-1">
                  {project.completionPercent}% · {project.issues.done}/{project.issues.total} tasks
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
