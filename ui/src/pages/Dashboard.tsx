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
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Target, FolderKanban, AlertTriangle, CheckCircle2, Plus, ShieldCheck, CircleDot, Zap } from "lucide-react";
import { PageSkeleton } from "../components/PageSkeleton";
import type { Issue, GoalProgress, ProjectProgress } from "@substaff/shared";

function ProgressRing({ percent, size = 40, strokeWidth = 3.5, className }: { percent: number; size?: number; strokeWidth?: number; className?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 100 ? "stroke-emerald-500" : clamped >= 50 ? "stroke-primary" : "stroke-amber-500";

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
    planned: "bg-secondary text-secondary-foreground",
    active: "bg-primary/10 text-primary",
    achieved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    cancelled: "bg-destructive/10 text-destructive",
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

function SectionHeading({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[13px] font-medium text-muted-foreground">
        {children}
      </h3>
      {subtitle && (
        <p className="text-xs text-muted-foreground/60 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
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
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {(() => {
              const hour = new Date().getHours();
              if (hour < 12) return "Good morning";
              if (hour < 17) return "Good afternoon";
              return "Good evening";
            })()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? (
              currentWork.length > 0 ? (
                <>
                  <span className="text-foreground font-medium">{currentWork.length} {currentWork.length === 1 ? "task" : "tasks"}</span> being worked on right now
                  {data.tasks.blocked > 0 && (
                    <span className="text-destructive"> &middot; {data.tasks.blocked} stuck</span>
                  )}
                </>
              ) : data.tasks.inProgress > 0 ? (
                <>
                  <span className="text-foreground font-medium">{data.tasks.inProgress} {data.tasks.inProgress === 1 ? "task" : "tasks"}</span> in progress
                  {data.tasks.blocked > 0 && (
                    <span className="text-destructive"> &middot; {data.tasks.blocked} stuck</span>
                  )}
                </>
              ) : data.tasks.open > 0 ? (
                <>
                  <span className="text-foreground font-medium">{data.tasks.open} {data.tasks.open === 1 ? "task" : "tasks"}</span> waiting to be picked up
                </>
              ) : data.tasks.done > 0 ? (
                <>All {data.tasks.done} tasks complete</>
              ) : (
                "An overview of your team's progress and recent activity."
              )
            ) : (
              "An overview of your team's progress and recent activity."
            )}
          </p>
        </div>
        <Button onClick={() => openNewIssue()} className="shrink-0">
          <Plus className="h-4 w-4" />
          Create Task
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/50 bg-amber-50/50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-950/30">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
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

      {/* Pending Approvals */}
      {data && data.pendingApprovals > 0 && (
        <Link
          to="/approvals"
          className="flex items-center gap-3 rounded-lg border border-amber-200/50 bg-amber-50/50 px-4 py-3 hover:bg-amber-50 transition-colors no-underline text-inherit dark:border-amber-500/20 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
        >
          <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-900 dark:text-amber-200 flex-1">
            <span className="font-medium">{data.pendingApprovals}</span> {data.pendingApprovals === 1 ? "request" : "requests"} waiting for your review
          </p>
          <span className="text-xs text-amber-700 dark:text-amber-300 font-medium shrink-0">Review &rarr;</span>
        </Link>
      )}

      {/* Currently Working On */}
      <div>
        <SectionHeading subtitle="Tasks agents are actively executing">Currently working on</SectionHeading>
        {currentWork.length > 0 ? (
          <div className="rounded-xl border border-border/50 divide-y divide-border/50 overflow-hidden stagger-children">
            {currentWork.map((run) => {
              const issue = run.issueId ? issueById.get(run.issueId) : undefined;
              const isActive = run.status === "running" || run.status === "queued";
              return (
                <Link
                  key={run.id}
                  to={issue ? `/issues/${issue.identifier ?? run.issueId}` : `/agents/${run.agentId}/runs/${run.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors no-underline text-inherit"
                >
                  {isActive ? (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                  ) : (
                    <span className="flex h-2 w-2 shrink-0">
                      <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground/30" />
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {issue ? (
                        <>
                          <span className="text-muted-foreground">{issue.identifier}</span>
                          <span className="mx-1.5 text-border">&middot;</span>
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
          <div className="rounded-xl border border-border/50">
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

      {/* Goals & Projects */}
      {data && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div className="min-w-0">
            <SectionHeading subtitle="Progress toward your objectives">Goals</SectionHeading>
            {data.goals.length > 0 ? (
              <div className="rounded-xl border border-border/50 divide-y divide-border/50 overflow-hidden stagger-children">
                {data.goals.map((goal: GoalProgress) => (
                  <Link
                    key={goal.goalId}
                    to={`/goals/${goal.goalId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors no-underline text-inherit"
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
              <div className="rounded-xl border border-border/50">
                <EmptyState
                  icon={Target}
                  message="No goals yet. Goals help track high-level objectives across projects."
                  compact
                />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <SectionHeading subtitle="Active projects and their task progress">Projects</SectionHeading>
            {data.projects.length > 0 ? (
              <div className="rounded-xl border border-border/50 divide-y divide-border/50 overflow-hidden stagger-children">
                {data.projects.map((project: ProjectProgress) => (
                  <Link
                    key={project.projectId}
                    to={`/projects/${project.projectId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors no-underline text-inherit"
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
              <div className="rounded-xl border border-border/50">
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

      {/* Recently Completed + Recent Tasks */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="min-w-0">
          <SectionHeading subtitle="Tasks finished by your team">Recently completed</SectionHeading>
          {completedIssues.length > 0 ? (
            <div className="rounded-xl border border-border/50 divide-y divide-border/50 overflow-hidden stagger-children">
              {completedIssues.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/40 transition-colors no-underline text-inherit"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {timeAgo(issue.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/50">
              <EmptyState
                icon={CheckCircle2}
                message="No completed tasks yet. Tasks will appear here once finished."
                compact
              />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <SectionHeading subtitle="Latest tasks across your workspace">Recent tasks</SectionHeading>
          {recentIssues.length === 0 ? (
            <div className="rounded-xl border border-border/50">
              <EmptyState
                icon={CircleDot}
                message="No tasks yet. Create your first task to get things moving."
                compact
                action="Create Task"
                onAction={() => openNewIssue()}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 divide-y divide-border/50 overflow-hidden stagger-children">
              {recentIssues.slice(0, 10).map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/40 transition-colors no-underline text-inherit"
                >
                  <div className="flex items-center gap-1.5 shrink-0">
                    <PriorityIcon priority={issue.priority} />
                    <StatusIcon status={issue.status} />
                  </div>
                  <span className="min-w-0 flex-1 truncate">
                    {issue.title}
                  </span>
                  {issue.assigneeAgentId && (() => {
                    const name = agentName(issue.assigneeAgentId);
                    return name
                      ? <Identity name={name} size="sm" className="hidden sm:inline-flex shrink-0" />
                      : null;
                  })()}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {timeAgo(issue.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
