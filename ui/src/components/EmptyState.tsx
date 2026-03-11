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
      <Icon className={cn(
        "text-muted-foreground/25 mb-3",
        compact ? "h-8 w-8" : "h-10 w-10",
      )} />
      <p className={cn(
        "text-muted-foreground max-w-[260px] leading-relaxed",
        compact ? "text-xs" : "text-sm",
      )}>{message}</p>
      {action && onAction && (
        <Button size={compact ? "sm" : "default"} variant="outline" onClick={onAction} className="mt-4">
          <Plus className="h-4 w-4" />
          {action}
        </Button>
      )}
    </div>
  );
}
