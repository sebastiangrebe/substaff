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
import { MetricCard } from "../components/MetricCard";
import { ActivityRow } from "../components/ActivityRow";
import { ChartCard, RunActivityChart, IssueStatusChart, SuccessRateChart, TaskCompletionChart } from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import { Bot, CircleDot, CheckCircle2, ShieldCheck, BarChart3 } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Performance metrics and trends across your company.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-1 sm:gap-2">
            <MetricCard
              icon={Bot}
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label="Team Members"
              to="/agents"
              description={
                <span>
                  {data.agents.running} working{", "}
                  {data.agents.paused} paused{", "}
                  {data.agents.error} need help
                </span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label="Tasks In Progress"
              to="/issues"
              description={
                <span>
                  {data.tasks.open} open{", "}
                  {data.tasks.blocked} stuck
                </span>
              }
            />
            <MetricCard
              icon={CheckCircle2}
              value={data.tasks.done ?? 0}
              label="Tasks Completed"
              to="/issues"
              description={
                <span>
                  {(runs ?? []).length} total runs
                </span>
              }
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals}
              label="Pending Reviews"
              to="/approvals"
              description={
                <span>
                  {data.staleTasks} tasks need attention
                </span>
              }
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ChartCard title="Run Activity" subtitle="Last 14 days">
              <RunActivityChart runs={runs ?? []} />
            </ChartCard>
            <ChartCard title="Task Completion" subtitle="Last 14 days">
              <TaskCompletionChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title="Tasks by Status" subtitle="Last 14 days">
              <IssueStatusChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title="Success Rate" subtitle="Last 14 days">
              <SuccessRateChart runs={runs ?? []} />
            </ChartCard>
          </div>
        </>
      )}

      {recentActivity.length > 0 && (
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-muted-foreground mb-3">
            Recent Activity
          </h3>
          <div className="border border-border/50 divide-y divide-border/50 rounded-xl overflow-hidden">
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
      )}
    </div>
  );
}
