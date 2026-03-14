import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Agent, GoalProgress } from "@substaff/shared";
import { goalsApi } from "../api/goals";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { assetsApi } from "../api/assets";
import { authApi } from "../api/auth";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { usePanel } from "../context/PanelContext";
import { queryKeys } from "../lib/queryKeys";
import { GoalProperties } from "../components/GoalProperties";
import { StatusBadge } from "../components/StatusBadge";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { InlineEditor } from "../components/InlineEditor";
import { EntityRow } from "../components/EntityRow";
import { ActivityRow } from "../components/ActivityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn, projectUrl, relativeTime } from "../lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity as ActivityIcon,
  ChevronDown,
  Hexagon,
  ListTodo,
  Target,
} from "lucide-react";
import type { ActivityEvent } from "@substaff/shared";
import { Identity } from "../components/Identity";
import { formatActivityVerb, humanizeActorName } from "../lib/activity-labels";

function ActorIdentity({ evt, agentMap }: { evt: ActivityEvent; agentMap: Map<string, Agent> }) {
  const id = evt.actorId;
  if (evt.actorType === "agent") {
    const agent = agentMap.get(id);
    return <Identity name={agent?.name ?? id.slice(0, 8)} size="sm" />;
  }
  return <Identity name={humanizeActorName(evt.actorType, id || null)} size="sm" />;
}

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openPanel, closePanel } = usePanel();
  const queryClient = useQueryClient();
  const [activityOpen, setActivityOpen] = useState(false);

  const {
    data: goal,
    isLoading,
    error
  } = useQuery({
    queryKey: queryKeys.goals.detail(goalId!),
    queryFn: () => goalsApi.get(goalId!),
    enabled: !!goalId
  });
  const resolvedCompanyId = goal?.companyId ?? selectedCompanyId;

  const { data: allProjects } = useQuery({
    queryKey: queryKeys.projects.list(resolvedCompanyId!),
    queryFn: () => projectsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId
  });

  useEffect(() => {
    if (!goal?.companyId || goal.companyId === selectedCompanyId) return;
    setSelectedCompanyId(goal.companyId, { source: "route_sync" });
  }, [goal?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const updateGoal = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      goalsApi.update(goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.goals.detail(goalId!)
      });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(resolvedCompanyId)
        });
      }
    }
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(
        resolvedCompanyId,
        file,
        `goals/${goalId ?? "draft"}`
      );
    }
  });

  const { data: progress } = useQuery({
    queryKey: queryKeys.goals.progress(goalId!),
    queryFn: () => goalsApi.progress(goalId!),
    enabled: !!goalId,
  });

  const { data: activity } = useQuery({
    queryKey: [...queryKeys.activity(resolvedCompanyId!), "goal", goalId],
    queryFn: () => activityApi.list(resolvedCompanyId!, { entityType: "goal", entityId: goalId }),
    enabled: !!resolvedCompanyId && !!goalId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(resolvedCompanyId!),
    queryFn: () => agentsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  // Fetch issues for all linked projects
  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(resolvedCompanyId!),
    queryFn: () => issuesApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });

  const linkedProjects = (allProjects ?? []).filter((p) => {
    if (!goalId) return false;
    if (p.goalIds.includes(goalId)) return true;
    if (p.goals.some((goalRef) => goalRef.id === goalId)) return true;
    return p.goalId === goalId;
  });

  const linkedProjectIds = useMemo(
    () => new Set(linkedProjects.map((p) => p.id)),
    [linkedProjects],
  );

  // Issues linked to this goal (via project or direct goalId)
  const goalIssues = useMemo(() => {
    if (!allIssues || !goalId) return [];
    return allIssues.filter(
      (i) =>
        i.goalId === goalId ||
        (i.projectId && linkedProjectIds.has(i.projectId)),
    );
  }, [allIssues, goalId, linkedProjectIds]);

  // Non-done issues to show as pending tasks
  const pendingIssues = useMemo(
    () => goalIssues.filter((i) => i.status !== "done" && i.status !== "cancelled"),
    [goalIssues],
  );

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (goal) map.set(`goal:${goal.id}`, goal.title);
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    return map;
  }, [goal, agents]);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (session?.user) map.set(session.user.id, session.user.name ?? "You");
    return map;
  }, [session]);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Goals", href: "/goals" },
      { label: goal?.title ?? goalId ?? "Goal" }
    ]);
  }, [setBreadcrumbs, goal, goalId]);

  // Open properties panel (matching IssueDetail pattern)
  useEffect(() => {
    if (goal) {
      openPanel(
        <GoalProperties goal={goal} onUpdate={(data) => updateGoal.mutate(data)} />
      );
    }
    return () => closePanel();
  }, [goal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!goal) return null;

  return (
    <div>
      {/* ── Hero header card ─────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-6">
        <div className="px-5 pt-5 pb-4 space-y-3">
          {/* Top row: status badge + meta */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span style={{ viewTransitionName: `entity-status-${goal.id}` } as CSSProperties}>
              <StatusBadge status={goal.status} />
            </span>

            {goal.ownerAgentId && (() => {
              const owner = agentMap.get(goal.ownerAgentId);
              return owner ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Identity name={owner.name} size="sm" />
                </span>
              ) : null;
            })()}
          </div>

          {/* Title */}
          <div style={{ viewTransitionName: `entity-title-${goal.id}` } as CSSProperties}>
            <InlineEditor
              value={goal.title}
              onSave={(title) => updateGoal.mutate({ title })}
              as="h2"
              className="text-xl font-bold tracking-tight"
            />
          </div>

          {/* Description */}
          <InlineEditor
            value={goal.description ?? ""}
            onSave={(description) => updateGoal.mutate({ description })}
            as="p"
            className="text-sm text-muted-foreground leading-relaxed"
            placeholder="Add a description..."
            multiline
            imageUploadHandler={async (file) => {
              const asset = await uploadImage.mutateAsync(file);
              return asset.contentPath;
            }}
          />
        </div>
      </div>

      {/* ── Progress ── */}
      {progress && progress.issues.total > 0 && (
        <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progress</span>
          </div>
          <div className="px-4 py-4">
            <ProgressSection progress={progress} />
          </div>
        </div>
      )}

      {/* ── Linked projects ── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Hexagon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Projects</span>
          {linkedProjects.length > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">{linkedProjects.length}</span>
          )}
        </div>
        {linkedProjects.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground/60">No linked projects</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {linkedProjects.map((project) => (
              <EntityRow
                key={project.id}
                title={project.name}
                subtitle={project.description ?? undefined}
                to={projectUrl(project)}
                trailing={<StatusBadge status={project.status} />}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Pending tasks ── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending Tasks</span>
          {pendingIssues.length > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">{pendingIssues.length}</span>
          )}
        </div>
        {pendingIssues.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground/60">No pending tasks</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {pendingIssues.map((issue) => (
              <EntityRow
                key={issue.id}
                leading={
                  <>
                    <StatusIcon status={issue.status} />
                    <PriorityIcon priority={issue.priority} />
                  </>
                }
                identifier={issue.identifier ?? undefined}
                title={issue.title}
                subtitle={
                  issue.assigneeAgentId
                    ? agentMap.get(issue.assigneeAgentId)?.name
                    : undefined
                }
                to={`/issues/${issue.identifier ?? issue.id}`}
                trailing={<StatusBadge status={issue.status} />}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Activity (collapsible) ── */}
      {activity && activity.length > 0 && (
        <Collapsible
          open={activityOpen}
          onOpenChange={setActivityOpen}
          className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/20 transition-colors">
            <div className="flex items-center gap-2">
              <ActivityIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity</span>
              <span className="text-xs text-muted-foreground/60 tabular-nums">{activity.length}</span>
            </div>
            <ChevronDown
              className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform", activityOpen && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border/40 px-4 py-2">
              {activity.slice(0, 20).map((evt) => (
                <div key={evt.id} className="flex items-center gap-2 py-2 text-xs text-muted-foreground border-b border-border/20 last:border-0">
                  <ActorIdentity evt={evt} agentMap={agentMap} />
                  <span className="flex-1 min-w-0 truncate">{formatActivityVerb(evt.action, evt.details)}</span>
                  <span className="shrink-0 text-muted-foreground/60 tabular-nums">{relativeTime(evt.createdAt)}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function ProgressSection({ progress }: { progress: GoalProgress }) {
  const { issues, completionPercent } = progress;
  const pct = Math.round(completionPercent);
  const barColor = pct >= 85 ? "bg-green-400" : pct >= 50 ? "bg-yellow-400" : "bg-blue-400";

  return (
    <div className="space-y-4">
      {/* Overall progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {issues.done} of {issues.total} tasks complete
          </span>
          <span className="text-xs font-medium">{pct}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Issue breakdown */}
      <div className="grid grid-cols-4 gap-3">
        <CountChip label="Done" count={issues.done} colorClass="text-green-500" />
        <CountChip label="In Progress" count={issues.inProgress} colorClass="text-blue-500" />
        <CountChip label="Blocked" count={issues.blocked} colorClass="text-red-500" />
        <CountChip label="Open" count={issues.open} colorClass="text-muted-foreground" />
      </div>

      {/* Per-project breakdown */}
      {progress.projects.length > 1 && (
        <div className="space-y-2 pt-1">
          {progress.projects.map((p) => {
            const ppct = Math.round(p.completionPercent);
            return (
              <div key={p.projectId} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.issues.done}/{p.issues.total} · {ppct}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all"
                    style={{ width: `${ppct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CountChip({ label, count, colorClass }: { label: string; count: number; colorClass: string }) {
  return (
    <div className="text-center rounded-lg bg-muted/30 py-2">
      <p className={`text-lg font-bold ${colorClass}`}>{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
