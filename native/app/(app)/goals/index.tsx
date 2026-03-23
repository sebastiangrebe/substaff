import { View, Text, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { useApi } from "../../../hooks/useApi";
import { useCompany } from "../../../hooks/useCompany";
import { router } from "expo-router";
import { useState } from "react";
import type { Goal } from "@substaff/shared";

export default function GoalsScreen() {
  const { goalsApi } = useApi();
  const { selectedCompanyId } = useCompany();
  const [refreshing, setRefreshing] = useState(false);
  const companyId = selectedCompanyId ?? "";

  const { data: goals = [], refetch } = useQuery({
    queryKey: queryKeys.goals.list(companyId),
    queryFn: () => goalsApi.list(companyId),
    enabled: !!companyId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function renderGoal({ item }: { item: Goal }) {
    return (
      <TouchableOpacity
        className="bg-card border border-border rounded-lg p-4 mb-2"
        onPress={() => router.push(`/(app)/goals/${item.id}`)}
      >
        <Text className="text-foreground font-semibold">{item.title}</Text>
        <View className="bg-secondary rounded px-2 py-0.5 self-start mt-2">
          <Text className="text-xs text-secondary-foreground">{item.status}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={goals}
        keyExtractor={(item) => item.id}
        renderItem={renderGoal}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text className="text-muted-foreground text-center mt-8">No goals found</Text>
        }
      />
    </View>
  );
}
