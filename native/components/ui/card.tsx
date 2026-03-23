import { View, Text, type ViewProps, type TextProps } from "react-native";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("bg-card rounded-xl border border-border p-6", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("gap-1.5 pb-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: TextProps & { className?: string }) {
  return <Text className={cn("text-lg font-semibold text-card-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: TextProps & { className?: string }) {
  return <Text className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-row items-center pt-4", className)} {...props} />;
}
