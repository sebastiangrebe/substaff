import { View, Text } from "react-native";
import {
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
} from "lucide-react-native";
import { cn } from "../../lib/utils";

const priorityConfig: Record<string, { icon: typeof ArrowUp; color: string; label: string }> = {
  critical: { icon: AlertTriangle, color: "#dc2626", label: "Critical" },
  high: { icon: ArrowUp, color: "#ea580c", label: "High" },
  medium: { icon: Minus, color: "#ca8a04", label: "Medium" },
  low: { icon: ArrowDown, color: "#2563eb", label: "Low" },
};

interface PriorityIconProps {
  priority: string;
  showLabel?: boolean;
  size?: number;
  className?: string;
}

export function PriorityIcon({ priority, showLabel, size = 14, className }: PriorityIconProps) {
  const config = priorityConfig[priority] ?? priorityConfig.medium!;
  const Icon = config.icon;

  const icon = (
    <View className={cn("items-center justify-center", className)}>
      <Icon size={size} color={config.color} />
    </View>
  );

  if (showLabel) {
    return (
      <View className="flex-row items-center gap-1.5">
        {icon}
        <Text className="text-sm text-foreground">{config.label}</Text>
      </View>
    );
  }

  return icon;
}
