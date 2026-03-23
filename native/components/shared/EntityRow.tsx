import { View, Text, Pressable, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface EntityRowProps {
  identifier?: string | null;
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  className?: string;
}

export function EntityRow({
  identifier,
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  selected,
  className,
}: EntityRowProps) {
  const content = (
    <View
      className={cn(
        "flex-row items-center gap-3 px-4 py-3 border-b border-border",
        selected && "bg-accent",
        className,
      )}
    >
      {leading}
      <View className="flex-1 min-w-0">
        {identifier && (
          <Text className="text-xs text-muted-foreground font-mono mb-0.5">
            {identifier}
          </Text>
        )}
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}
