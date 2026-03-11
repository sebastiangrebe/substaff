import type { Goal } from "@substaff/shared";
import { StatusBadge } from "./StatusBadge";
import { Identity } from "./Identity";
import { Target, Calendar } from "lucide-react";
import { relativeTime } from "../lib/utils";

interface GoalPreviewProps {
  goal: Goal;
  agentName: (id: string | null) => string | null;
  progress?: { total: number; done: number } | null;
}

export function GoalPreview({ goal, agentName, progress }: GoalPreviewProps) {
  const ownerName = agentName(goal.ownerAgentId);
  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Title + status */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Target className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <h3 className="text-sm font-medium leading-snug">
            {goal.title}
          </h3>
        </div>
        <div>
          <StatusBadge status={goal.status} />
        </div>
      </div>

      {/* Description */}
      {goal.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {goal.description}
        </p>
      )}

      {/* Progress bar */}
      {pct !== null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {progress!.done} of {progress!.total} tasks complete
          </span>
        </div>
      )}

      {/* Properties */}
      <div className="space-y-2 pt-1">
        {ownerName && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Owner</span>
            <Identity name={ownerName} size="sm" />
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Updated</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {relativeTime(goal.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
