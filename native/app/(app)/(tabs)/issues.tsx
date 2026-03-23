import { View, Text, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { timeAgo } from "@substaff/app-core/utils/timeAgo";
import { useApi } from "../../../hooks/useApi";
import { useCompany } from "../../../hooks/useCompany";
import { router } from "expo-router";
import { useState, useMemo } from "react";
import type { Issue } from "@substaff/shared";
import { StatusIcon } from "../../../components/shared/StatusIcon";
import { PriorityIcon } from "../../../components/shared/PriorityIcon";
import { EmptyState } from "../../../components/shared/EmptyState";
import { TabBar } from "../../../components/ui/tabs";
import { ListChecks } from "lucide-react-native";

const FILTER_TABS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "Active" },
  { value: "all", label: "All" },
];

export default function IssuesScreen() {
  const { issuesApi } = useApi();
  const { selectedCompanyId } = useCompany();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("open");

  const companyId = selectedCompanyId ?? "";

  const { data: issues = [], refetch } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: !!companyId,
  });

  const filteredIssues = useMemo(() => {
    if (filter === "all") return issues;
    if (filter === "open") return issues.filter((i) => i.status !== "done" && i.status !== "cancelled");
    return issues.filter((i) => i.status === filter);
  }, [issues, filter]);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function renderIssue({ item }: { item: Issue }) {
    return (
      <TouchableOpacity
        className="bg-card border border-border rounded-lg p-4 mb-2"
        onPress={() => router.push(`/(app)/issues/${item.id}`)}
        activeOpacity={0.7}
      >
        <View className="flex-row items-center justify-between mb-1.5">
          <View className="flex-row items-center gap-2">
            <StatusIcon status={item.status} />
            <Text className="text-xs text-muted-foreground font-mono">
              {item.identifier ?? item.id.slice(0, 8)}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {timeAgo(item.createdAt)}
          </Text>
        </View>
        <Text className="text-foreground font-medium" numberOfLines={2}>
          {item.title}
        </Text>
        <View className="flex-row items-center gap-2 mt-2">
          <PriorityIcon priority={item.priority} size={12} />
          <Text className="text-xs text-muted-foreground capitalize">{item.priority}</Text>
          {item.assigneeAgentId ? (
            <>
              <Text className="text-xs text-muted-foreground">·</Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                Assigned
              </Text>
            </>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-3 pb-2">
        <TabBar tabs={FILTER_TABS} value={filter} onValueChange={setFilter} />
      </View>
      <FlatList
        data={filteredIssues}
        keyExtractor={(item) => item.id}
        renderItem={renderIssue}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={ListChecks}
            message={companyId ? "No issues match this filter" : "Select a company to view issues"}
          />
        }
      />
    </View>
  );
}
