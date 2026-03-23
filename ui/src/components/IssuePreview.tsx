import type { Issue } from "@substaff/shared";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "./StatusBadge";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { Calendar, MessageSquare } from "lucide-react";
import { relativeTime, cn } from "../lib/utils";
import { live } from "../lib/status-colors";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";

interface IssuePreviewProps {
  issue: Issue;
  agentName: (id: string | null) => string | null;
  isLive?: boolean;
}

export function IssuePreview({ issue, agentName, isLive }: IssuePreviewProps) {
  const assigneeName = agentName(issue.assigneeAgentId);

  const { data: comments } = useQuery({
    queryKey: queryKeys.issues.comments(issue.id),
    queryFn: () => issuesApi.listComments(issue.id),
    staleTime: 30_000,
  });

  const recentComments = (comments ?? []).slice(-3);

  return (
    <div className="space-y-3.5">
      {/* Header: status + identifier + live badge */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={issue.status} />
          <span className="text-[10px] font-mono text-muted-foreground">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          {isLive && (
            <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium", live.bg, live.border, live.text)}>
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", live.ping)} />
                <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", live.dot)} />
              </span>
              Running
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold leading-snug">
          {issue.title}
        </h3>

        {/* Status + priority row */}
        <div className="flex items-center gap-1.5">
          <StatusBadge status={issue.status} />
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <PriorityIcon priority={issue.priority} />
            <span className="capitalize">{issue.priority}</span>
          </span>
        </div>
      </div>

      {/* Description */}
      {issue.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {issue.description}
        </p>
      )}

      {/* Labels */}
      {issue.labels && issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                borderColor: label.color,
                color: label.color,
                backgroundColor: `${label.color}1a`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Properties */}
      <div className="divide-y divide-border/40">
        {assigneeName && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground/70">Assignee</span>
            <Identity name={assigneeName} size="sm" />
          </div>
        )}
        {issue.project && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground/70">Project</span>
            <span className="text-xs font-medium flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-sm shrink-0"
                style={{ backgroundColor: issue.project.color ?? "#6366f1" }}
              />
              {issue.project.name}
            </span>
          </div>
        )}
        {issue.goal && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground/70">Goal</span>
            <span className="text-xs font-medium">{issue.goal.title}</span>
          </div>
        )}
        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-muted-foreground/70">Created</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {relativeTime(issue.createdAt)}
          </span>
        </div>
      </div>

      {/* Lifecycle timeline */}
      {(issue.startedAt || issue.completedAt) && (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Timeline</span>
          <div className="relative pl-4 space-y-2">
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border/50" />
            {issue.startedAt && (
              <div className="relative flex items-center gap-2">
                <div className="absolute left-[-14px] h-2 w-2 rounded-full bg-primary border-2 border-card" />
                <span className="text-[11px] text-muted-foreground">Started {relativeTime(issue.startedAt)}</span>
              </div>
            )}
            {issue.completedAt && (
              <div className="relative flex items-center gap-2">
                <div className="absolute left-[-14px] h-2 w-2 rounded-full bg-green-500 border-2 border-card" />
                <span className="text-[11px] text-muted-foreground">Completed {relativeTime(issue.completedAt)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent comments */}
      {recentComments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3 text-muted-foreground/30" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
              Recent
            </span>
            {(comments?.length ?? 0) > 3 && (
              <span className="text-[10px] text-muted-foreground/30 ml-auto">
                +{(comments?.length ?? 0) - 3} more
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {recentComments.map((comment) => {
              const commentAuthor = comment.authorAgentId
                ? agentName(comment.authorAgentId) ?? "Agent"
                : "You";
              return (
                <div key={comment.id} className="rounded-md bg-muted/20 px-2.5 py-2 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-foreground/70">{commentAuthor}</span>
                    <span className="text-[10px] text-muted-foreground/40">{relativeTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {comment.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
