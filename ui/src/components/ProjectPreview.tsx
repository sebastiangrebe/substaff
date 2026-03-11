import type { Project } from "@substaff/shared";
import { StatusBadge } from "./StatusBadge";
import { Identity } from "./Identity";
import { Hexagon, Calendar } from "lucide-react";
import { formatDate, relativeTime } from "../lib/utils";

interface ProjectPreviewProps {
  project: Project;
  agentName: (id: string | null) => string | null;
  issueStats?: { total: number; done: number } | null;
}

export function ProjectPreview({ project, agentName, issueStats }: ProjectPreviewProps) {
  const leadName = agentName(project.leadAgentId);
  const pct = issueStats && issueStats.total > 0
    ? Math.round((issueStats.done / issueStats.total) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Title + status */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span
            className="shrink-0 h-4 w-4 rounded-sm mt-0.5"
            style={{ backgroundColor: project.color ?? "#6366f1" }}
          />
          <h3 className="text-sm font-medium leading-snug">
            {project.name}
          </h3>
        </div>
        <div>
          <StatusBadge status={project.status} />
        </div>
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
            <span className="text-muted-foreground">Task progress</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {issueStats!.done} of {issueStats!.total} tasks complete
          </span>
        </div>
      )}

      {/* Goals */}
      {project.goals && project.goals.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Goals</span>
          <div className="flex flex-wrap gap-1.5">
            {project.goals.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                <Hexagon className="h-2.5 w-2.5" />
                {g.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Properties */}
      <div className="space-y-2 pt-1">
        {leadName && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Lead</span>
            <Identity name={leadName} size="sm" />
          </div>
        )}
        {project.targetDate && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Due date</span>
            <span className="text-xs font-medium">{formatDate(project.targetDate)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Updated</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {relativeTime(project.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
