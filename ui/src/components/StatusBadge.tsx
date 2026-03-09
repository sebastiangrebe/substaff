import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";
import { statusLabel } from "../lib/labels";

const dotColor: Record<string, string> = {
  active: "bg-green-500",
  running: "bg-cyan-500 animate-pulse",
  idle: "bg-yellow-500",
  paused: "bg-orange-500",
  error: "bg-red-500",
  terminated: "bg-neutral-400",
  pending_approval: "bg-amber-500",
};

export function StatusBadge({ status, showDot }: { status: string; showDot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 animate-scale-in",
        statusBadge[status] ?? statusBadgeDefault
      )}
    >
      {showDot && dotColor[status] && (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColor[status])} />
      )}
      {statusLabel(status)}
    </span>
  );
}
