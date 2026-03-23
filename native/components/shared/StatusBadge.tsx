import { View, Text } from "react-native";
import { cn } from "../../lib/utils";
import {
  statusBadge,
  statusBadgeDefault,
} from "@substaff/app-core/utils/status-colors";
import { statusLabel } from "@substaff/app-core/utils/labels";

const dotColor: Record<string, string> = {
  active: "bg-emerald-500",
  running: "bg-indigo-500",
  idle: "bg-amber-500",
  paused: "bg-orange-500",
  error: "bg-rose-500",
  terminated: "bg-neutral-400",
  pending_approval: "bg-amber-500",
};

interface StatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({ status, showDot, className }: StatusBadgeProps) {
  const badgeClasses = statusBadge[status] ?? statusBadgeDefault;

  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 rounded-full px-2.5 py-0.5 self-start",
        badgeClasses,
        className,
      )}
    >
      {showDot && dotColor[status] && (
        <View className={cn("h-1.5 w-1.5 rounded-full", dotColor[status])} />
      )}
      <Text className="text-xs font-medium">{statusLabel(status)}</Text>
    </View>
  );
}
