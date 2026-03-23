import { View, Text, Pressable } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  onPress?: () => void;
  className?: string;
}

export function MetricCard({ icon: Icon, value, label, description, onPress, className }: MetricCardProps) {
  const content = (
    <View className={cn("bg-card border border-border rounded-xl p-4", className)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-2xl font-semibold text-foreground tracking-tight">
            {value}
          </Text>
          <Text className="text-xs font-medium text-muted-foreground mt-1">
            {label}
          </Text>
          {typeof description === "string" ? (
            <Text className="text-xs text-muted-foreground mt-1.5">{description}</Text>
          ) : description ? (
            <View className="mt-1.5">{description}</View>
          ) : null}
        </View>
        <Icon size={16} color="#9ca3af" />
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return content;
}
