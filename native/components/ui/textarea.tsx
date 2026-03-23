import { forwardRef } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "../../lib/utils";

interface TextareaProps extends TextInputProps {
  className?: string;
}

export const Textarea = forwardRef<TextInput, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        multiline
        textAlignVertical="top"
        className={cn(
          "min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground",
          className,
        )}
        placeholderTextColor="#9ca3af"
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
