import { Text, type TextProps } from "react-native";
import { cn } from "../../lib/utils";

interface LabelProps extends TextProps {
  className?: string;
}

export function Label({ className, ...props }: LabelProps) {
  return (
    <Text
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}
