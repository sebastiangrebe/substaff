import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#18181b",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarLabel: "Home",
        }}
      />
      <Tabs.Screen
        name="issues"
        options={{
          title: "Issues",
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: "Agents",
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
        }}
      />
    </Tabs>
  );
}
