import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: string;
  onAction?: () => void;
  /** Compact variant for inline sections (smaller padding) */
  compact?: boolean;
}

export function EmptyState({ icon: Icon, message, action, onAction, compact }: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center",
      compact ? "py-8" : "py-16",
    )}>
      <div className="relative mb-4">
        <div className={cn(
          "rounded-full bg-muted/60",
          compact ? "h-14 w-14" : "h-16 w-16",
        )}>
          <Icon className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/40",
            compact ? "h-6 w-6" : "h-7 w-7",
          )} />
        </div>
      </div>
      <p className={cn(
        "text-muted-foreground max-w-[240px]",
        compact ? "text-xs" : "text-sm",
      )}>{message}</p>
      {action && onAction && (
        <Button size={compact ? "sm" : "default"} onClick={onAction} className="mt-4">
          <Plus className="h-4 w-4 mr-1.5" />
          {action}
        </Button>
      )}
    </div>
  );
}
