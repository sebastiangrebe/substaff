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
      compact ? "py-6 px-4" : "py-12 px-6",
    )}>
      <div className={cn(
        "rounded-xl bg-muted/50 flex items-center justify-center mb-3",
        compact ? "h-10 w-10" : "h-12 w-12",
      )}>
        <Icon className={cn(
          "text-muted-foreground/40",
          compact ? "h-5 w-5" : "h-6 w-6",
        )} />
      </div>
      <p className={cn(
        "text-muted-foreground max-w-[240px] leading-relaxed",
        compact ? "text-xs" : "text-sm",
      )}>{message}</p>
      {action && onAction && (
        <Button size="sm" variant="outline" onClick={onAction} className="mt-3">
          <Plus className="h-3.5 w-3.5" />
          {action}
        </Button>
      )}
    </div>
  );
}
