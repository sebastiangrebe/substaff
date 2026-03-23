import { View, Text, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { useApi } from "../../../hooks/useApi";
import { useCompany } from "../../../hooks/useCompany";
import { router } from "expo-router";
import { useState, useMemo } from "react";
import type { Agent } from "@substaff/shared";
import { StatusBadge } from "../../../components/shared/StatusBadge";
import { Identity } from "../../../components/shared/Identity";
import { EmptyState } from "../../../components/shared/EmptyState";
import { TabBar } from "../../../components/ui/tabs";
import { agentStatusDot, agentStatusDotDefault } from "@substaff/app-core/utils/status-colors";
import { agentRoleLabel, formatLabel } from "@substaff/app-core/utils/labels";
import { Users } from "lucide-react-native";
import { cn } from "../../../lib/utils";

const FILTER_TABS = [
  { value: "active", label: "Active" },
  { value: "all", label: "All" },
];

export default function AgentsScreen() {
  const { agentsApi } = useApi();
  const { selectedCompanyId } = useCompany();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("active");

  const companyId = selectedCompanyId ?? "";

  const { data: agents = [], refetch } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const filteredAgents = useMemo(() => {
    if (filter === "all") return agents;
    return agents.filter((a) => (a.status as string) !== "terminated" && (a.status as string) !== "archived");
  }, [agents, filter]);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function renderAgent({ item }: { item: Agent }) {
    const dotClass = agentStatusDot[item.status] ?? agentStatusDotDefault;
    const roleDisplay = item.role ? (agentRoleLabel[item.role] ?? formatLabel(item.role)) : null;

    return (
      <TouchableOpacity
        className="bg-card border border-border rounded-lg p-4 mb-2"
        onPress={() => router.push(`/(app)/agents/${item.id}`)}
        activeOpacity={0.7}
      >
        <View className="flex-row items-start gap-3">
          {/* Status dot */}
          <View className="pt-1.5">
            <View className={cn("h-2.5 w-2.5 rounded-full", dotClass)} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-foreground font-semibold text-base" numberOfLines={1}>
                {item.name}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            {item.title ? (
              <Text className="text-muted-foreground text-sm mt-0.5" numberOfLines={1}>
                {item.title}
              </Text>
            ) : null}
            <View className="flex-row items-center gap-2 mt-2">
              {roleDisplay && (
                <Text className="text-xs text-muted-foreground">{roleDisplay}</Text>
              )}
              {roleDisplay && (
                <Text className="text-xs text-muted-foreground">·</Text>
              )}
              <Text className="text-xs text-muted-foreground">{item.adapterType}</Text>
            </View>
          </View>
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
        data={filteredAgents}
        keyExtractor={(item) => item.id}
        renderItem={renderAgent}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={Users}
            message={companyId ? "No agents match this filter" : "Select a company to view agents"}
          />
        }
      />
    </View>
  );
}
