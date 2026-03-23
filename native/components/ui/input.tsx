import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "../../lib/utils";

interface InputProps extends TextInputProps {
  className?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        className={cn(
          "h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground",
          className,
        )}
        placeholderTextColor="#9ca3af"
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
