import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault, live } from "../lib/status-colors";
import { statusLabel } from "../lib/labels";

const dotColor: Record<string, string> = {
  active: "bg-emerald-500",
  running: `${live.dot} animate-pulse`,
  idle: "bg-amber-500",
  paused: "bg-orange-500",
  error: "bg-rose-500",
  terminated: "bg-neutral-400",
  pending_approval: "bg-amber-500",
};

export function StatusBadge({ status, showDot, className }: { status: string; showDot?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 animate-scale-in",
        statusBadge[status] ?? statusBadgeDefault,
        className,
      )}
    >
      {showDot && dotColor[status] && (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColor[status])} />
      )}
      {statusLabel(status)}
    </span>
  );
}
