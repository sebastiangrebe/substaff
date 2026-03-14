import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { goalsApi } from "../api/goals";
import { authApi } from "../api/auth";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { ActivityRow } from "../components/ActivityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, Filter } from "lucide-react";
import { cn } from "../lib/utils";
import type { Agent, ActivityEvent } from "@substaff/shared";
import { humanizeEntityType } from "../lib/activity-labels";

/* ── Group events by date ── */

function groupByDate(events: ActivityEvent[]): { label: string; date: string; events: ActivityEvent[] }[] {
  const groups = new Map<string, ActivityEvent[]>();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  for (const event of events) {
    const dateStr = new Date(event.createdAt).toISOString().slice(0, 10);
    if (!groups.has(dateStr)) groups.set(dateStr, []);
    groups.get(dateStr)!.push(event);
  }

  return Array.from(groups.entries()).map(([date, events]) => {
    let label: string;
    if (date === todayStr) label = "Today";
    else if (date === yesterdayStr) label = "Yesterday";
    else {
      const d = new Date(date + "T12:00:00");
      label = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    }
    return { label, date, events };
  });
}

export function Activity() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Activity" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
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

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

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
    for (const g of goals ?? []) map.set(`goal:${g.id}`, g.title);
    return map;
  }, [issues, agents, projects, goals]);

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

  const filtered = useMemo(
    () =>
      data && filter !== "all"
        ? data.filter((e) => e.entityType === filter)
        : data,
    [data, filter],
  );

  const entityTypes = useMemo(
    () => (data ? [...new Set(data.map((e) => e.entityType))].sort() : []),
    [data],
  );

  const dateGroups = useMemo(
    () => (filtered ? groupByDate(filtered) : []),
    [filtered],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={History} message="Select a company to view activity." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Activity</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A log of everything happening across your company.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <Filter className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {entityTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {humanizeEntityType(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {filtered && filtered.length === 0 && (
        <EmptyState icon={History} message="No activity yet." />
      )}

      {/* ── Grouped Activity Feed ── */}
      {dateGroups.length > 0 && (
        <div className="space-y-4">
          {dateGroups.map((group) => (
            <div key={group.date}>
              {/* Date group header */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {group.events.length} event{group.events.length !== 1 ? "s" : ""}
                </span>
              </div>
              {/* Events for this date */}
              <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border/50">
                {group.events.map((event) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
