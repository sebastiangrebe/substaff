import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

interface SkeletonProps extends ViewProps {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <View
      className={cn("rounded-md bg-muted animate-pulse", className)}
      {...props}
    />
  );
}
