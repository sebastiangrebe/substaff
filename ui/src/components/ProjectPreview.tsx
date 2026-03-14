import type { Project } from "@substaff/shared";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "./StatusBadge";
import { Identity } from "./Identity";
import { Calendar } from "lucide-react";
import { formatDate, relativeTime } from "../lib/utils";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";

interface ProjectPreviewProps {
  project: Project;
  agentName: (id: string | null) => string | null;
  issueStats?: { total: number; done: number } | null;
}

export function ProjectPreview({ project, agentName, issueStats: issueStatsProp }: ProjectPreviewProps) {
  const leadName = agentName(project.leadAgentId);

  const { data: projectProgress } = useQuery({
    queryKey: queryKeys.projects.progress(project.id),
    queryFn: () => projectsApi.progress(project.id),
    staleTime: 30_000,
  });

  const issueCounts = projectProgress?.issues;
  const pct = projectProgress
    ? projectProgress.completionPercent
    : issueStatsProp && issueStatsProp.total > 0
      ? Math.round((issueStatsProp.done / issueStatsProp.total) * 100)
      : null;

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            className="shrink-0 h-3 w-3 rounded-sm"
            style={{ backgroundColor: project.color ?? "#6366f1" }}
          />
          <StatusBadge status={project.status} />
        </div>
        <h3 className="text-sm font-semibold leading-snug">
          {project.name}
        </h3>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {project.description}
        </p>
      )}

      {/* Progress bar */}
      {pct !== null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground/70">Task progress</span>
            <span className="font-semibold tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {issueCounts && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-green-500 font-medium tabular-nums">{issueCounts.done} done</span>
              {issueCounts.inProgress > 0 && (
                <span className="text-muted-foreground/60 tabular-nums">{issueCounts.inProgress} active</span>
              )}
              {issueCounts.blocked > 0 && (
                <span className="text-red-400 tabular-nums">{issueCounts.blocked} blocked</span>
              )}
              {issueCounts.open > 0 && (
                <span className="text-muted-foreground/30 tabular-nums">{issueCounts.open} open</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Goals */}
      {project.goals && project.goals.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Goals</span>
          <div className="flex flex-wrap gap-1.5">
            {project.goals.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {g.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Properties */}
      <div className="divide-y divide-border/40">
        {leadName && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground/70">Lead</span>
            <Identity name={leadName} size="sm" />
          </div>
        )}
        {project.targetDate && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground/70">Due date</span>
            <span className="text-xs font-medium">{formatDate(project.targetDate)}</span>
          </div>
        )}
        {issueCounts && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground/70">Total tasks</span>
            <span className="text-xs font-medium tabular-nums">{issueCounts.total}</span>
          </div>
        )}
        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-muted-foreground/70">Updated</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {relativeTime(project.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
