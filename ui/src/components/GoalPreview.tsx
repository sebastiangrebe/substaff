import type { Goal } from "@substaff/shared";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "./StatusBadge";
import { Identity } from "./Identity";
import { Target, Calendar, Hexagon } from "lucide-react";
import { relativeTime } from "../lib/utils";
import { goalsApi } from "../api/goals";
import { queryKeys } from "../lib/queryKeys";

interface GoalPreviewProps {
  goal: Goal;
  agentName: (id: string | null) => string | null;
  progress?: { total: number; done: number } | null;
}

export function GoalPreview({ goal, agentName, progress: progressProp }: GoalPreviewProps) {
  const ownerName = agentName(goal.ownerAgentId);

  const { data: goalProgress } = useQuery({
    queryKey: queryKeys.goals.progress(goal.id),
    queryFn: () => goalsApi.progress(goal.id),
    staleTime: 30_000,
  });

  const pct = goalProgress
    ? goalProgress.completionPercent
    : progressProp && progressProp.total > 0
      ? Math.round((progressProp.done / progressProp.total) * 100)
      : null;

  const issueCounts = goalProgress?.issues;
  const projects = goalProgress?.projects;

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          <StatusBadge status={goal.status} />
        </div>
        <h3 className="text-sm font-semibold leading-snug">
          {goal.title}
        </h3>
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
            <span className="text-muted-foreground/70">Progress</span>
            <span className="font-semibold tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {issueCounts && (
            <span className="text-[10px] text-muted-foreground/50">
              {issueCounts.done} of {issueCounts.total} tasks complete
            </span>
          )}
        </div>
      )}

      {/* Properties */}
      <div className="divide-y divide-border/40">
        {ownerName && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground/70">Owner</span>
            <Identity name={ownerName} size="sm" />
          </div>
        )}
        {issueCounts && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground/70">Tasks</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-500 font-medium tabular-nums">{issueCounts.done} done</span>
              {issueCounts.inProgress > 0 && (
                <span className="text-muted-foreground/60 tabular-nums">{issueCounts.inProgress} active</span>
              )}
              {(issueCounts.total - issueCounts.done - issueCounts.inProgress) > 0 && (
                <span className="text-muted-foreground/30 tabular-nums">{issueCounts.total - issueCounts.done - issueCounts.inProgress} left</span>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-muted-foreground/70">Updated</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {relativeTime(goal.updatedAt)}
          </span>
        </div>
      </div>

      {/* Linked projects */}
      {projects && projects.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Hexagon className="h-3 w-3 text-muted-foreground/30" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
              Projects
            </span>
          </div>
          <div className="space-y-1">
            {projects.map((proj) => (
              <div key={proj.projectId} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/20">
                <span
                  className="h-2 w-2 rounded-sm shrink-0"
                  style={{ backgroundColor: "#6366f1" }}
                />
                <span className="text-xs truncate flex-1 min-w-0">{proj.name}</span>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                  {proj.completionPercent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
