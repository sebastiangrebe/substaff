import { View, Text, Image, type ImageProps } from "react-native";
import { cn } from "../../lib/utils";

type AvatarSize = "xs" | "sm" | "default" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-5 w-5",
  sm: "h-6 w-6",
  default: "h-8 w-8",
  lg: "h-10 w-10",
};

const textSizeClasses: Record<AvatarSize, string> = {
  xs: "text-[8px]",
  sm: "text-[10px]",
  default: "text-xs",
  lg: "text-sm",
};

interface AvatarProps {
  size?: AvatarSize;
  src?: string | null;
  fallback: string;
  className?: string;
}

export function Avatar({ size = "default", src, fallback, className }: AvatarProps) {
  return (
    <View
      className={cn(
        "rounded-full bg-muted items-center justify-center overflow-hidden",
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          className="h-full w-full"
          resizeMode="cover"
        />
      ) : (
        <Text className={cn("font-medium text-muted-foreground", textSizeClasses[size])}>
          {fallback}
        </Text>
      )}
    </View>
  );
}
