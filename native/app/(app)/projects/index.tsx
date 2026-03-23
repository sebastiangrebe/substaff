import { View, Text, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@substaff/app-core/queries";
import { useApi } from "../../../hooks/useApi";
import { useCompany } from "../../../hooks/useCompany";
import { router } from "expo-router";
import { useState } from "react";
import type { Project } from "@substaff/shared";

export default function ProjectsScreen() {
  const { projectsApi } = useApi();
  const { selectedCompanyId } = useCompany();
  const [refreshing, setRefreshing] = useState(false);
  const companyId = selectedCompanyId ?? "";

  const { data: projects = [], refetch } = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: !!companyId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function renderProject({ item }: { item: Project }) {
    return (
      <TouchableOpacity
        className="bg-card border border-border rounded-lg p-4 mb-2"
        onPress={() => router.push(`/(app)/projects/${item.id}`)}
      >
        <Text className="text-foreground font-semibold">{item.name}</Text>
        {item.description ? (
          <Text className="text-muted-foreground text-sm mt-1" numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <View className="bg-secondary rounded px-2 py-0.5 self-start mt-2">
          <Text className="text-xs text-secondary-foreground">{item.status}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={renderProject}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text className="text-muted-foreground text-center mt-8">No projects found</Text>
        }
      />
    </View>
  );
}
