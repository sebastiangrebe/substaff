import { forwardRef } from "react";
import { Pressable, Text, type PressableProps, type ViewStyle } from "react-native";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary",
  outline: "border border-border bg-background",
  secondary: "bg-secondary",
  ghost: "",
  destructive: "bg-destructive",
  link: "",
};

const variantTextClasses: Record<ButtonVariant, string> = {
  default: "text-primary-foreground",
  outline: "text-foreground",
  secondary: "text-secondary-foreground",
  ghost: "text-foreground",
  destructive: "text-destructive-foreground",
  link: "text-primary underline",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-8 px-3",
  lg: "h-12 px-6",
  icon: "h-10 w-10",
};

const sizeTextClasses: Record<ButtonSize, string> = {
  default: "text-sm",
  sm: "text-xs",
  lg: "text-base",
  icon: "text-sm",
};

export const Button = forwardRef<any, ButtonProps>(
  ({ variant = "default", size = "default", className, textClassName, children, disabled, ...props }, ref) => {
    return (
      <Pressable
        ref={ref}
        className={cn(
          "flex-row items-center justify-center rounded-lg",
          variantClasses[variant],
          sizeClasses[size],
          disabled && "opacity-50",
          className,
        )}
        disabled={disabled}
        {...props}
      >
        {typeof children === "string" ? (
          <Text
            className={cn(
              "font-medium",
              variantTextClasses[variant],
              sizeTextClasses[size],
              textClassName,
            )}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </Pressable>
    );
  },
);

Button.displayName = "Button";
