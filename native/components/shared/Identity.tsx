import { View, Text } from "react-native";
import { cn } from "../../lib/utils";
import { Avatar } from "../ui/avatar";

type IdentitySize = "xs" | "sm" | "default" | "lg";

interface IdentityProps {
  name: string;
  avatarUrl?: string | null;
  initials?: string;
  size?: IdentitySize;
  className?: string;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const textSizeClasses: Record<IdentitySize, string> = {
  xs: "text-xs",
  sm: "text-xs",
  default: "text-sm",
  lg: "text-sm",
};

export function Identity({ name, avatarUrl, initials, size = "default", className }: IdentityProps) {
  const displayInitials = initials ?? deriveInitials(name);

  return (
    <View className={cn("flex-row items-center gap-1.5", size === "lg" && "gap-2", className)}>
      <Avatar
        size={size}
        src={avatarUrl}
        fallback={displayInitials}
      />
      <Text className={cn("text-foreground", textSizeClasses[size])} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}
