import { View, Text } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, message, action, onAction, compact }: EmptyStateProps) {
  return (
    <View
      className={cn(
        "items-center justify-center",
        compact ? "py-6 px-4" : "py-12 px-6",
      )}
    >
      <View
        className={cn(
          "rounded-xl bg-muted items-center justify-center mb-3",
          compact ? "h-10 w-10" : "h-12 w-12",
        )}
      >
        <Icon
          size={compact ? 20 : 24}
          color="#9ca3af"
        />
      </View>
      <Text
        className={cn(
          "text-muted-foreground text-center max-w-[240px] leading-relaxed",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {message}
      </Text>
      {action && onAction && (
        <Button
          variant="outline"
          size="sm"
          onPress={onAction}
          className="mt-3"
        >
          {action}
        </Button>
      )}
    </View>
  );
}
