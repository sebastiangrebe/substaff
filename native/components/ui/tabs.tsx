import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { cn } from "../../lib/utils";

interface Tab {
  value: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function TabBar({ tabs, value, onValueChange, className }: TabsProps) {
  return (
    <View className={cn("flex-row bg-muted rounded-lg p-1", className)}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.value}
          onPress={() => onValueChange(tab.value)}
          className={cn(
            "flex-1 items-center justify-center rounded-md py-1.5 px-3",
            value === tab.value && "bg-background shadow-sm",
          )}
        >
          <Text
            className={cn(
              "text-sm font-medium",
              value === tab.value ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
