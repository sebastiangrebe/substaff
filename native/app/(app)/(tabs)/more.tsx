import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";

const menuItems = [
  { label: "Projects", route: "/(app)/projects" as const },
  { label: "Goals", route: "/(app)/goals" as const },
  { label: "Approvals", route: "/(app)/approvals" as const },
  { label: "Settings", route: "/(app)/settings" as const },
];

export default function MoreScreen() {
  async function handleLogout() {
    await SecureStore.deleteItemAsync("substaff.auth.token");
    router.replace("/(auth)/login");
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4">
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.label}
            className="bg-card border border-border rounded-lg p-4 mb-2 flex-row items-center justify-between"
            onPress={() => router.push(item.route)}
          >
            <Text className="text-foreground font-medium">{item.label}</Text>
            <Text className="text-muted-foreground">›</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          className="bg-destructive rounded-lg p-4 mt-6 items-center"
          onPress={handleLogout}
        >
          <Text className="text-destructive-foreground font-semibold">Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
