import type { Issue } from "@substaff/shared";
import { StatusBadge } from "./StatusBadge";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { Calendar, Hexagon, Tag } from "lucide-react";
import { relativeTime } from "../lib/utils";
import { issueStatusLabel, formatLabel } from "../lib/labels";

interface IssuePreviewProps {
  issue: Issue;
  agentName: (id: string | null) => string | null;
  isLive?: boolean;
}

export function IssuePreview({ issue, agentName, isLive }: IssuePreviewProps) {
  const assigneeName = agentName(issue.assigneeAgentId);

  return (
    <div className="space-y-4">
      {/* Title + identifier */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <StatusIcon status={issue.status} />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium leading-snug">
              <span className="text-[11px] font-mono text-muted-foreground mr-1.5 align-middle">
                {issue.identifier ?? issue.id.slice(0, 8)}
              </span>
              {issue.title}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={issue.status} />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <PriorityIcon priority={issue.priority} />
            <span className="capitalize">{issue.priority}</span>
          </div>
          {isLive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-[11px] font-medium text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              Live
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {issue.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
          {issue.description}
        </p>
      )}

      {/* Labels */}
      {issue.labels && issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={{
                borderColor: label.color,
                color: label.color,
                backgroundColor: `${label.color}1f`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Properties */}
      <div className="space-y-2 pt-1">
        {assigneeName && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Assignee</span>
            <Identity name={assigneeName} size="sm" />
          </div>
        )}
        {issue.project && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Project</span>
            <span className="text-xs font-medium flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: issue.project.color ?? "#6366f1" }}
              />
              {issue.project.name}
            </span>
          </div>
        )}
        {issue.goal && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Goal</span>
            <span className="text-xs font-medium">{issue.goal.title}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Created</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {relativeTime(issue.createdAt)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Updated</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {relativeTime(issue.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
