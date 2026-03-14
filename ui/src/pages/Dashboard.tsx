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
import { LayoutDashboard, Target, FolderKanban, AlertTriangle, CheckCircle2, Plus, ShieldCheck, CircleDot, Zap, ArrowRight, Bot, ListTodo, DollarSign, Users } from "lucide-react";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { agentUrl } from "../lib/utils";
import type { Issue, GoalProgress, ProjectProgress, Agent } from "@substaff/shared";

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

function SectionHeading({ children, subtitle, action }: { children: React.ReactNode; subtitle?: string; action?: { label: string; to: string } }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {children}
        </h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && (
        <Link to={action.to} className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 no-underline">
          {action.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
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

  const visibleAgents = useMemo(() =>
    (agents ?? []).filter((a: Agent) => a.status !== "terminated"),
    [agents],
  );

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

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
      {/* Page header — full width, unified zone */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            {(() => {
              const hour = new Date().getHours();
              if (hour < 12) return "Good morning";
              if (hour < 17) return "Good afternoon";
              return "Good evening";
            })()}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
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
                "Here's an overview of your team's progress and activity."
              )
            ) : (
              "Here's an overview of your team's progress and activity."
            )}
          </p>
        </div>
        <Button onClick={() => openNewIssue()} size="sm" className="shrink-0">
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

      {/* Two-column body */}
      <div className="flex gap-6">
      {/* Main content */}
      <div className="space-y-6 flex-1 min-w-0">

      {/* Currently Working On */}
      <div>
        <SectionHeading subtitle="Tasks agents are actively executing" action={currentWork.length > 0 ? { label: "View all", to: "/issues" } : undefined}>Currently working on</SectionHeading>
        {currentWork.length > 0 ? (
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs stagger-children">
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
          <div className="rounded-xl border border-border/60 bg-card shadow-xs">
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
        <div className="grid md:grid-cols-2 gap-6">
          <div className="min-w-0">
            <SectionHeading subtitle="Progress toward your objectives" action={{ label: "All goals", to: "/goals" }}>Goals</SectionHeading>
            {data.goals.length > 0 ? (
              <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs stagger-children">
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
              <div className="rounded-xl border border-border/60 bg-card shadow-xs">
                <EmptyState
                  icon={Target}
                  message="No goals yet. Goals help track high-level objectives across projects."
                  compact
                />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <SectionHeading subtitle="Active projects and their task progress" action={{ label: "All projects", to: "/projects" }}>Projects</SectionHeading>
            {data.projects.length > 0 ? (
              <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs stagger-children">
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
              <div className="rounded-xl border border-border/60 bg-card shadow-xs">
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
            <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs stagger-children">
              {completedIssues.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className="flex items-center gap-3 px-4 text-sm hover:bg-accent/40 transition-colors no-underline text-inherit h-10"
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
            <div className="rounded-xl border border-border/60 bg-card shadow-xs">
              <EmptyState
                icon={CheckCircle2}
                message="No completed tasks yet. Tasks will appear here once finished."
                compact
              />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <SectionHeading subtitle="Latest tasks across your workspace" action={{ label: "All tasks", to: "/issues" }}>Recent tasks</SectionHeading>
          {recentIssues.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card shadow-xs">
              <EmptyState
                icon={CircleDot}
                message="No tasks yet. Create your first task to get things moving."
                compact
                action="Create Task"
                onAction={() => openNewIssue()}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs stagger-children">
              {recentIssues.slice(0, 10).map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  className="flex items-center gap-3 px-4 text-sm hover:bg-accent/40 transition-colors no-underline text-inherit h-10"
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
      </div>{/* end main content */}

      {/* Right sidebar */}
      <div className="hidden xl:block w-72 shrink-0 space-y-5 sticky top-6 self-start">
        {/* Quick stats */}
        {data && (
          <div>
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Overview</h4>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard icon={Bot} label="Agents" value={data.agents.active + data.agents.running} accent={data.agents.running > 0 ? "live" : undefined} sub={data.agents.running > 0 ? `${data.agents.running} running` : "idle"} href="/agents" />
            <StatCard icon={ListTodo} label="Tasks" value={data.tasks.open + data.tasks.inProgress} sub={`${data.tasks.done} done`} href="/issues" />
            <StatCard
              icon={DollarSign}
              label="Spend"
              value={`$${(data.costs.monthSpendCents / 100).toFixed(0)}`}
              sub="this month"
              href="/billing"
            />
            <StatCard icon={Target} label="Goals" value={data.goals.length} sub={data.goals.filter((g: GoalProgress) => g.goalStatus === "achieved").length > 0 ? `${data.goals.filter((g: GoalProgress) => g.goalStatus === "achieved").length} achieved` : "in progress"} href="/goals" />
          </div>
          </div>
        )}

        {/* Team status */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Team</h4>
            <Link to="/agents" className="text-xs text-primary hover:text-primary/80 transition-colors no-underline">
              View all
            </Link>
          </div>
          <div className="rounded-xl border border-border/60 bg-card shadow-xs divide-y divide-border/50 overflow-hidden">
            {visibleAgents.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-muted-foreground">No team members yet</p>
              </div>
            ) : (
              visibleAgents.slice(0, 8).map((agent: Agent) => {
                const runCount = liveCountByAgent.get(agent.id) ?? 0;
                const statusColor = runCount > 0 ? "bg-blue-500" : agent.status === "active" ? "bg-emerald-500" : agent.status === "paused" ? "bg-amber-500" : agent.status === "error" ? "bg-red-500" : "bg-muted-foreground/30";
                return (
                  <Link
                    key={agent.id}
                    to={agentUrl(agent)}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/40 transition-colors no-underline text-inherit"
                  >
                    <AgentIcon icon={agent.icon} className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1">{agent.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {runCount > 0 ? (
                        <>
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", statusColor)} />
                          </span>
                          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">{runCount}</span>
                        </>
                      ) : (
                        <span className={cn("inline-flex rounded-full h-1.5 w-1.5", statusColor)} />
                      )}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Attention items */}
        {data && (data.tasks.blocked > 0 || data.staleTasks > 0 || data.pendingApprovals > 0) && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Attention</h4>
            <div className="space-y-1.5">
              {data.tasks.blocked > 0 && (
                <Link to="/issues?status=blocked" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors no-underline text-inherit">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-xs"><span className="font-medium">{data.tasks.blocked}</span> blocked tasks</span>
                </Link>
              )}
              {data.staleTasks > 0 && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-amber-500/5 border border-amber-500/10">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs"><span className="font-medium">{data.staleTasks}</span> stale tasks</span>
                </div>
              )}
              {data.pendingApprovals > 0 && (
                <Link to="/approvals" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-colors no-underline text-inherit">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs"><span className="font-medium">{data.pendingApprovals}</span> pending approvals</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
      </div>{/* end two-column body */}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent, href }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub: string;
  accent?: "live" | "error";
  href?: string;
}) {
  const content = (
    <div className={cn("rounded-xl border border-border/60 bg-card shadow-xs px-3 py-2.5", href && "hover:bg-accent/50 transition-colors cursor-pointer")}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className={cn(
        "text-[10px] mt-0.5",
        accent === "live" ? "text-blue-600 dark:text-blue-400 font-medium" :
        accent === "error" ? "text-red-500 font-medium" :
        "text-muted-foreground",
      )}>{sub}</div>
    </div>
  );
  if (href) return <Link to={href} className="no-underline text-inherit">{content}</Link>;
  return content;
}
