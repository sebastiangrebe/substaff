import { View, Text, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { timeAgo } from "@substaff/app-core/utils/timeAgo";
import { useApi } from "../../../hooks/useApi";
import { useCompany } from "../../../hooks/useCompany";
import { router } from "expo-router";
import { useState } from "react";
import type { Approval } from "@substaff/shared";

export default function ApprovalsScreen() {
  const { approvalsApi } = useApi();
  const { selectedCompanyId } = useCompany();
  const [refreshing, setRefreshing] = useState(false);
  const companyId = selectedCompanyId ?? "";

  const { data: approvals = [], refetch } = useQuery({
    queryKey: queryKeys.approvals.list(companyId),
    queryFn: () => approvalsApi.list(companyId),
    enabled: !!companyId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function renderApproval({ item }: { item: Approval }) {
    return (
      <TouchableOpacity
        className="bg-card border border-border rounded-lg p-4 mb-2"
        onPress={() => router.push(`/(app)/approvals/${item.id}`)}
      >
        <Text className="text-foreground font-medium">{item.type.replace(/_/g, " ")}</Text>
        <View className="flex-row items-center gap-2 mt-2">
          <View className="bg-secondary rounded px-2 py-0.5">
            <Text className="text-xs text-secondary-foreground">{item.status}</Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {timeAgo(item.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={approvals}
        keyExtractor={(item) => item.id}
        renderItem={renderApproval}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text className="text-muted-foreground text-center mt-8">No approvals found</Text>
        }
      />
    </View>
  );
}
