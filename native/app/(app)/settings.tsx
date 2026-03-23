import { View, Text, ScrollView } from "react-native";

export default function SettingsScreen() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4">
        <Text className="text-xl font-bold text-foreground mb-4">Settings</Text>
        <Text className="text-muted-foreground">Settings will be available in a future update.</Text>
      </View>
    </ScrollView>
  );
}
