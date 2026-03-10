import { useEffect, useMemo } from "react";
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
import { queryKeys } from "../lib/queryKeys";
import { GoalProperties } from "../components/GoalProperties";
import { StatusBadge } from "../components/StatusBadge";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { InlineEditor } from "../components/InlineEditor";
import { EntityRow } from "../components/EntityRow";
import { ActivityRow } from "../components/ActivityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import { projectUrl } from "../lib/utils";

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

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

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!goal) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <InlineEditor
          value={goal.title}
          onSave={(title) => updateGoal.mutate({ title })}
          as="h2"
          className="text-lg font-semibold"
        />

        <InlineEditor
          value={goal.description ?? ""}
          onSave={(description) => updateGoal.mutate({ description })}
          as="p"
          className="text-sm text-muted-foreground"
          placeholder="Add a description..."
          multiline
          imageUploadHandler={async (file) => {
            const asset = await uploadImage.mutateAsync(file);
            return asset.contentPath;
          }}
        />
      </div>

      <div className="border-t border-border pt-4">
        <GoalProperties
          goal={goal}
          onUpdate={(data) => updateGoal.mutate(data)}
        />
      </div>

      {/* Linked projects */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Projects ({linkedProjects.length})</h3>
        {linkedProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked projects.</p>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
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

      {/* Progress */}
      {progress && progress.issues.total > 0 && (
        <ProgressSection progress={progress} />
      )}

      {/* Pending tasks */}
      {pendingIssues.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            Pending Tasks ({pendingIssues.length})
          </h3>
          <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
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
        </div>
      )}

      {/* Activity */}
      {activity && activity.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Activity</h3>
          <div className="border border-border rounded-xl overflow-hidden">
            {activity.slice(0, 10).map((event) => (
              <ActivityRow
                key={event.id}
                event={event}
                agentMap={agentMap}
                entityNameMap={entityNameMap}
                userNameMap={userNameMap}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressSection({ progress }: { progress: GoalProgress }) {
  const { issues, completionPercent } = progress;
  const pct = Math.round(completionPercent);
  const barColor = pct >= 85 ? "bg-green-400" : pct >= 50 ? "bg-yellow-400" : "bg-blue-400";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Progress</h3>

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
    <div className="text-center">
      <p className={`text-lg font-bold ${colorClass}`}>{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
