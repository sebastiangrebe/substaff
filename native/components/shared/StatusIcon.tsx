import { View, Text } from "react-native";
import { cn } from "../../lib/utils";
import {
  issueStatusIcon,
  issueStatusIconDefault,
} from "@substaff/app-core/utils/status-colors";
import { statusLabel } from "@substaff/app-core/utils/labels";

interface StatusIconProps {
  status: string;
  showLabel?: boolean;
  className?: string;
}

// Map web border classes to RN-compatible equivalents
const statusColors: Record<string, { border: string; bg: string }> = {
  backlog: { border: "border-gray-400", bg: "" },
  todo: { border: "border-indigo-600", bg: "" },
  in_progress: { border: "border-amber-600", bg: "" },
  in_review: { border: "border-violet-600", bg: "" },
  done: { border: "border-emerald-600", bg: "bg-emerald-600" },
  cancelled: { border: "border-neutral-500", bg: "" },
  blocked: { border: "border-rose-600", bg: "" },
};

export function StatusIcon({ status, showLabel, className }: StatusIconProps) {
  const colors = statusColors[status] ?? { border: "border-gray-400", bg: "" };
  const isDone = status === "done";

  const circle = (
    <View
      className={cn(
        "h-4 w-4 rounded-full border-2 items-center justify-center",
        colors.border,
        className,
      )}
    >
      {isDone && (
        <View className={cn("h-2 w-2 rounded-full", colors.bg)} />
      )}
    </View>
  );

  if (showLabel) {
    return (
      <View className="flex-row items-center gap-1.5">
        {circle}
        <Text className="text-sm text-foreground">{statusLabel(status)}</Text>
      </View>
    );
  }

  return circle;
}
