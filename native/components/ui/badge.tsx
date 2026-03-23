import { View, Text, type ViewProps, type TextProps } from "react-native";
import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary",
  secondary: "bg-secondary",
  destructive: "bg-destructive",
  outline: "border border-border bg-transparent",
};

const variantTextClasses: Record<BadgeVariant, string> = {
  default: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive-foreground",
  outline: "text-foreground",
};

export function Badge({ variant = "secondary", className, textClassName, children }: BadgeProps) {
  return (
    <View className={cn("rounded-full px-2.5 py-0.5 self-start", variantClasses[variant], className)}>
      {typeof children === "string" ? (
        <Text className={cn("text-xs font-medium", variantTextClasses[variant], textClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
