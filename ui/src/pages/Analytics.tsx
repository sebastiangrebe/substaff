import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { activityApi } from "../api/activity";
import { projectsApi } from "../api/projects";
import { authApi } from "../api/auth";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ActivityRow } from "../components/ActivityRow";
import {
  ChartCard,
  RunActivityChart,
  IssueStatusChart,
  SuccessRateChart,
  TaskCompletionChart,
} from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  Bot,
  CircleDot,
  CheckCircle2,
  ShieldCheck,
  BarChart3,
  Activity,
  TrendingUp,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/utils";
import type { Agent } from "@substaff/shared";

export function Analytics() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Analytics" }]);
  }, [setBreadcrumbs]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const recentActivity = useMemo(() => (activity ?? []).slice(0, 20), [activity]);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (session?.user) map.set(session.user.id, session.user.name ?? "You");
    return map;
  }, [session]);

  if (!selectedCompanyId) {
    return <EmptyState icon={BarChart3} message="Select a company to view analytics." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="analytics" />;
  }

  // Compute summary values for metric descriptions
  const totalTeam = data
    ? data.agents.active + data.agents.running + data.agents.paused + data.agents.error
    : 0;
  const workingCount = data?.agents.running ?? 0;
  const errorCount = data?.agents.error ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div>
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Performance metrics and trends across your company.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          {/* ── Metric Cards ── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Team Members */}
            <MetricCardEnhanced
              icon={Bot}
              iconColor="text-chart-1"
              iconBg="bg-chart-1/10"
              value={totalTeam}
              label="Team Members"
              to="/agents"
              detail={
                <>
                  <span className={cn(workingCount > 0 && "text-green-500")}>{workingCount} working</span>
                  {", "}
                  <span>{data.agents.paused} paused</span>
                  {errorCount > 0 && (
                    <span className="text-red-500">{", "}{errorCount} need help</span>
                  )}
                </>
              }
            />

            {/* Tasks In Progress */}
            <MetricCardEnhanced
              icon={CircleDot}
              iconColor="text-chart-3"
              iconBg="bg-chart-3/10"
              value={data.tasks.inProgress}
              label="Tasks In Progress"
              to="/issues"
              detail={
                <span>
                  {data.tasks.open} open{data.tasks.blocked > 0 && (
                    <span className="text-yellow-600">{", "}{data.tasks.blocked} stuck</span>
                  )}
                </span>
              }
            />

            {/* Tasks Completed */}
            <MetricCardEnhanced
              icon={CheckCircle2}
              iconColor="text-chart-4"
              iconBg="bg-chart-4/10"
              value={data.tasks.done ?? 0}
              label="Tasks Completed"
              to="/issues"
              detail={
                <span>{(runs ?? []).length} total runs</span>
              }
            />

            {/* Pending Reviews */}
            <MetricCardEnhanced
              icon={ShieldCheck}
              iconColor="text-chart-5"
              iconBg="bg-chart-5/10"
              value={data.pendingApprovals}
              label="Pending Reviews"
              to="/approvals"
              highlight={data.pendingApprovals > 0}
              detail={
                <span>
                  {data.staleTasks > 0 ? (
                    <span className="text-yellow-600">{data.staleTasks} need attention</span>
                  ) : (
                    "All caught up"
                  )}
                </span>
              }
            />
          </div>

          {/* ── Charts ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Trends</h3>
              <span className="text-xs text-muted-foreground">Last 14 days</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <ChartCard title="Run Activity">
                <RunActivityChart runs={runs ?? []} />
              </ChartCard>
              <ChartCard title="Task Completion">
                <TaskCompletionChart issues={issues ?? []} />
              </ChartCard>
              <ChartCard title="Tasks by Status">
                <IssueStatusChart issues={issues ?? []} />
              </ChartCard>
              <ChartCard title="Success Rate">
                <SuccessRateChart runs={runs ?? []} />
              </ChartCard>
            </div>
          </div>
        </>
      )}

      {/* ── Recent Activity ── */}
      {recentActivity.length > 0 && (
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent Activity</h3>
            <span className="text-xs text-muted-foreground">{recentActivity.length} events</span>
          </div>
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
              <span>Event</span>
              <span>Time</span>
            </div>
            <div className="divide-y divide-border/50">
              {recentActivity.map((event) => (
                <ActivityRow
                  key={event.id}
                  event={event}
                  agentMap={agentMap}
                  entityNameMap={entityNameMap}
                  entityTitleMap={entityTitleMap}
                  userNameMap={userNameMap}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Enhanced Metric Card (local to Analytics) ── */

import { Link } from "@/lib/router";
import type { LucideIcon, LucideProps } from "lucide-react";
import type { ReactNode } from "react";

function MetricCardEnhanced({
  icon: Icon,
  iconColor,
  iconBg,
  value,
  label,
  detail,
  to,
  highlight,
}: {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  value: string | number;
  label: string;
  detail?: ReactNode;
  to?: string;
  highlight?: boolean;
}) {
  const content = (
    <div className={cn(
      "rounded-xl border border-border bg-card p-5 transition-colors h-full",
      to && "hover:bg-accent/50 cursor-pointer",
      highlight && "border-yellow-400/30",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {detail && (
            <p className="text-xs text-muted-foreground/70 mt-1">{detail}</p>
          )}
        </div>
        <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg shrink-0", iconBg)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="no-underline text-inherit">
        {content}
      </Link>
    );
  }

  return content;
}
