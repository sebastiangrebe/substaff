import { useEffect, useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn, formatCents } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Target, FolderKanban, AlertTriangle, CheckCircle2, Plus, ShieldCheck, CircleDot, Zap } from "lucide-react";
import { PageSkeleton } from "../components/PageSkeleton";
import type { Issue, GoalProgress, ProjectProgress } from "@substaff/shared";

function ProgressRing({ percent, size = 40, strokeWidth = 3.5, className }: { percent: number; size?: number; strokeWidth?: number; className?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 100 ? "stroke-green-500" : clamped >= 50 ? "stroke-blue-500" : "stroke-amber-500";

  return (
    <div className={cn("relative inline-flex items-center justify-center shrink-0", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={cn("progress-ring-circle", color)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{
            "--ring-circumference": `${circumference}`,
            "--ring-offset": `${offset}`,
            strokeDashoffset: offset,
          } as React.CSSProperties}
        />
      </svg>
      <span className="absolute text-[9px] font-semibold tabular-nums text-muted-foreground">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function GoalStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    planned: "bg-muted text-muted-foreground",
    active: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    achieved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  const labels: Record<string, string> = {
    planned: "Planned",
    active: "Active",
    achieved: "Achieved",
    cancelled: "Cancelled",
  };
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", colors[status] ?? colors.planned)}>
      {labels[status] ?? status}
    </span>
  );
}

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function getRecentlyCompleted(issues: Issue[]): Issue[] {
  return issues
    .filter((i) => i.status === "done")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);
}

/** Deduplicate live runs by issueId, keeping the most recent per task */
function dedupeRunsByTask(runs: LiveRunForIssue[]): LiveRunForIssue[] {
  const seen = new Map<string, LiveRunForIssue>();
  const noIssue: LiveRunForIssue[] = [];
  for (const run of runs) {
    const key = run.issueId ?? null;
    if (!key) {
      noIssue.push(run);
      continue;
    }
    const existing = seen.get(key);
    if (!existing || new Date(run.createdAt) > new Date(existing.createdAt)) {
      seen.set(key, run);
    }
  }
  return [...seen.values(), ...noIssue];
}

export function Dashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding, openNewIssue } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Home" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId!), "dashboard"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) map.set(issue.id, issue);
    return map;
  }, [issues]);

  const recentIssues = useMemo(() => issues ? getRecentIssues(issues) : [], [issues]);
  const completedIssues = useMemo(() => issues ? getRecentlyCompleted(issues) : [], [issues]);
  const currentWork = useMemo(
    () => dedupeRunsByTask(liveRuns ?? []).filter((r) => r.issueId),
    [liveRuns],
  );

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Substaff! Set up your first workspace and team to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message="Create or select a workspace to get started." />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Your team is empty. Add your first team member to start getting work done.
            </p>
          </div>
          <button
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            Add team member
          </button>
        </div>
      )}

      {/* Welcome banner + status summary */}
      {data && (
        <div className="rounded-xl border border-border bg-gradient-to-r from-primary/5 via-background to-primary/5 px-6 py-5 animate-fade-up">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                {(() => {
                  const hour = new Date().getHours();
                  if (hour < 12) return "Good morning!";
                  if (hour < 17) return "Good afternoon!";
                  return "Good evening!";
                })()}
              </h2>
              <p className="text-sm text-muted-foreground">
                {currentWork.length > 0 ? (
                  <>
                    <span className="font-medium text-foreground">{currentWork.length} {currentWork.length === 1 ? "task" : "tasks"}</span> being worked on right now
                    {data.tasks.blocked > 0 && (
                      <span className="text-destructive"> &middot; {data.tasks.blocked} stuck</span>
                    )}
                  </>
                ) : data.tasks.inProgress > 0 ? (
                  <>
                    <span className="font-medium text-foreground">{data.tasks.inProgress} {data.tasks.inProgress === 1 ? "task" : "tasks"}</span> in progress
                    {data.tasks.blocked > 0 && (
                      <span className="text-destructive"> &middot; {data.tasks.blocked} stuck</span>
                    )}
                  </>
                ) : data.tasks.open > 0 ? (
                  <>
                    <span className="font-medium text-foreground">{data.tasks.open} {data.tasks.open === 1 ? "task" : "tasks"}</span> waiting to be picked up
                  </>
                ) : data.tasks.done > 0 ? (
                  <>All <span className="font-medium text-foreground">{data.tasks.done} tasks</span> are complete</>
                ) : (
                  <>No tasks yet &mdash; create one to get started</>
                )}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => openNewIssue()}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Task
            </Button>
          </div>
        </div>
      )}

      {/* Pending Approvals alert */}
      {data && data.pendingApprovals > 0 && (
        <Link
          to="/approvals"
          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100/80 transition-colors no-underline text-inherit dark:border-amber-500/25 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
        >
          <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-900 dark:text-amber-100 flex-1">
            <span className="font-medium">{data.pendingApprovals}</span> {data.pendingApprovals === 1 ? "request" : "requests"} waiting for your review
          </p>
          <span className="text-xs text-amber-700 dark:text-amber-300 font-medium shrink-0">Review &rarr;</span>
        </Link>
      )}

      {/* Currently Working On */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" />
          Currently Working On
        </h3>
        {currentWork.length > 0 ? (
          <div className="border border-border divide-y divide-border rounded-lg overflow-hidden stagger-children">
            {currentWork.map((run) => {
              const issue = run.issueId ? issueById.get(run.issueId) : undefined;
              const isActive = run.status === "running" || run.status === "queued";
              return (
                <Link
                  key={run.id}
                  to={issue ? `/issues/${issue.identifier ?? run.issueId}` : `/agents/${run.agentId}/runs/${run.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors no-underline text-inherit"
                >
                  {isActive ? (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                  ) : (
                    <span className="flex h-2 w-2 shrink-0">
                      <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground/40" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {issue ? (
                        <>
                          <span className="text-muted-foreground">{issue.identifier}</span>
                          <span className="mx-1.5 text-muted-foreground/50">&middot;</span>
                          {issue.title}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Background task</span>
                      )}
                    </div>
                  </div>
                  <Identity name={run.agentName} size="sm" className="shrink-0" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="border border-border rounded-lg">
            <EmptyState
              icon={Zap}
              message="No tasks are being worked on right now. Create a task and your team will pick it up automatically."
              compact
              action="Create Task"
              onAction={() => openNewIssue()}
            />
          </div>
        )}
      </div>

      {/* Goals & Projects Progress */}
      {data && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Target className="h-3.5 w-3.5" />
              Goals
            </h3>
            {data.goals.length > 0 ? (
              <div className="border border-border divide-y divide-border rounded-lg overflow-hidden stagger-children">
                {data.goals.map((goal: GoalProgress) => (
                  <Link
                    key={goal.goalId}
                    to={`/goals/${goal.goalId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors no-underline text-inherit"
                  >
                    <ProgressRing percent={goal.completionPercent} size={42} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate">{goal.title}</span>
                        <GoalStatusBadge status={goal.goalStatus} />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{goal.issues.total} tasks</span>
                        <span>{goal.issues.done} done</span>
                        {goal.issues.blocked > 0 && (
                          <span className="text-destructive">{goal.issues.blocked} stuck</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-lg">
                <EmptyState
                  icon={Target}
                  message="No goals yet. Goals help track high-level objectives across projects."
                  compact
                />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <FolderKanban className="h-3.5 w-3.5" />
              Projects
            </h3>
            {data.projects.length > 0 ? (
              <div className="border border-border divide-y divide-border rounded-lg overflow-hidden stagger-children">
                {data.projects.map((project: ProjectProgress) => (
                  <Link
                    key={project.projectId}
                    to={`/projects/${project.projectId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors no-underline text-inherit"
                  >
                    <ProgressRing percent={project.completionPercent} size={42} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{project.name}</span>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                        <span>{project.issues.total} tasks</span>
                        <span>{project.issues.done} done</span>
                        {project.issues.inProgress > 0 && (
                          <span>{project.issues.inProgress} in progress</span>
                        )}
                        {project.issues.blocked > 0 && (
                          <span className="text-destructive">{project.issues.blocked} stuck</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-lg">
                <EmptyState
                  icon={FolderKanban}
                  message="No projects yet. Projects group related tasks together."
                  compact
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recently Completed + Recent Tasks side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Recently Completed
          </h3>
          {completedIssues.length > 0 ? (
            <div className="border border-border divide-y divide-border rounded-lg overflow-hidden stagger-children">
              {completedIssues.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className="px-4 py-2 text-sm cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit block"
                >
                  <div className="flex gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                      <p className="min-w-0 flex-1 truncate">{issue.title}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
                      {timeAgo(issue.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="border border-border rounded-lg">
              <EmptyState
                icon={CheckCircle2}
                message="No completed tasks yet. Tasks will appear here once finished."
                compact
              />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <CircleDot className="h-3.5 w-3.5" />
            Recent Tasks
          </h3>
          {recentIssues.length === 0 ? (
            <div className="border border-border rounded-lg">
              <EmptyState
                icon={CircleDot}
                message="No tasks yet. Create your first task to get things moving."
                compact
                action="Create Task"
                onAction={() => openNewIssue()}
              />
            </div>
          ) : (
            <div className="border border-border divide-y divide-border rounded-lg overflow-hidden stagger-children">
              {recentIssues.slice(0, 10).map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className="px-4 py-2 text-sm cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit block"
                >
                  <div className="flex gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        <PriorityIcon priority={issue.priority} />
                        <StatusIcon status={issue.status} />
                      </div>
                      <p className="min-w-0 flex-1 truncate">
                        <span>{issue.title}</span>
                        {issue.assigneeAgentId && (() => {
                          const name = agentName(issue.assigneeAgentId);
                          return name
                            ? <span className="hidden sm:inline"><Identity name={name} size="sm" className="ml-2 inline-flex" /></span>
                            : null;
                        })()}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
                      {timeAgo(issue.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
