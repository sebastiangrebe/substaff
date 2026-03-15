import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, Link, useBeforeUnload } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type AgentKey, type ClaudeLoginResult } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { ChartCard, IssueStatusChart, SuccessRateChart, TotalCostChart, CostPerRunChart } from "../components/ActivityCharts";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { usePanel } from "../context/PanelContext";
import { useSidebar } from "@/components/ui/sidebar";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { AgentConfigForm } from "../components/AgentConfigForm";
import { roleLabels } from "../components/agent-config-primitives";
import { getUIAdapter, buildTranscript } from "../adapters";
import type { TranscriptEntry } from "../adapters";
import { StatusBadge } from "../components/StatusBadge";
import { StatusIcon as IssueStatusIcon } from "../components/StatusIcon";
import { MarkdownBody } from "../components/MarkdownBody";
import { EntityRow } from "../components/EntityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatCents, formatDate, relativeTime, formatTokens } from "../lib/utils";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MoreHorizontal,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Timer,
  Loader2,
  Slash,
  RotateCcw,
  Trash2,
  Plus,
  Key,
  Eye,
  EyeOff,
  Copy,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Settings,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { AgentIcon, AgentIconPicker } from "../components/AgentIconPicker";
import { isUuidLike, type Agent, type HeartbeatRun, type HeartbeatRunEvent, type AgentRuntimeState } from "@substaff/shared";
import { agentRouteRef } from "../lib/utils";

const runStatusIcons: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  succeeded: { icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
  failed: { icon: XCircle, color: "text-red-600 dark:text-red-400" },
  running: { icon: Loader2, color: "text-cyan-600 dark:text-cyan-400" },
  queued: { icon: Clock, color: "text-yellow-600 dark:text-yellow-400" },
  timed_out: { icon: Timer, color: "text-orange-600 dark:text-orange-400" },
  cancelled: { icon: Slash, color: "text-neutral-500 dark:text-neutral-400" },
};

const sourceLabels: Record<string, string> = {
  timer: "Timer",
  assignment: "Assignment",
  on_demand: "On-demand",
  automation: "Automation",
};

type AgentDetailView = "overview" | "configure" | "runs";

function parseAgentDetailView(value: string | null): AgentDetailView {
  if (value === "configure" || value === "configuration") return "configure";
  if (value === "runs") return value;
  return "overview";
}

function usageNumber(usage: Record<string, unknown> | null, ...keys: string[]) {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function runMetrics(run: HeartbeatRun) {
  const usage = (run.usageJson ?? null) as Record<string, unknown> | null;
  const result = (run.resultJson ?? null) as Record<string, unknown> | null;
  const input = usageNumber(usage, "inputTokens", "input_tokens");
  const output = usageNumber(usage, "outputTokens", "output_tokens");
  const cached = usageNumber(
    usage,
    "cachedInputTokens",
    "cached_input_tokens",
    "cache_read_input_tokens",
  );
  const cost =
    usageNumber(usage, "costUsd", "cost_usd", "total_cost_usd") ||
    usageNumber(result, "total_cost_usd", "cost_usd", "costUsd");
  return {
    input,
    output,
    cached,
    cost,
    totalTokens: input + output,
  };
}

type RunLogChunk = { ts: string; stream: "stdout" | "stderr" | "system"; chunk: string };

/**
 * Try to extract a human-readable string from a raw stdout/system line.
 * Many adapters emit JSON blobs — we extract the meaningful text content
 * (assistant messages, tool names, errors) and drop pure-noise lines.
 */
function humanizeStdoutLine(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try to parse as JSON
  let obj: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      obj = parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON — return as-is (could be a plain text line)
    return trimmed;
  }

  if (!obj) return trimmed;

  const type = typeof obj.type === "string" ? obj.type : "";

  // Claude Code streaming JSON messages
  if (type === "assistant") {
    const message = typeof obj.message === "object" && obj.message ? (obj.message as Record<string, unknown>) : null;
    const content = Array.isArray(message?.content) ? message!.content : [];
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string" && b.text) {
        parts.push(b.text);
      }
      // Skip tool_use blocks — too technical for human view
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }

  if (type === "user") {
    const message = typeof obj.message === "object" && obj.message ? (obj.message as Record<string, unknown>) : null;
    const content = Array.isArray(message?.content) ? message!.content : [];
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string" && b.text) {
        parts.push(b.text);
      } else if (b.type === "tool_result" && b.is_error === true) {
        const errContent = typeof b.content === "string" ? b.content : "";
        if (errContent) parts.push(`Tool error: ${errContent}`);
      }
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }

  // result — cost is already shown in the run header, skip in human view
  if (type === "result") return null;

  if (type === "system") {
    if (obj.subtype === "init") {
      const model = typeof obj.model === "string" ? obj.model : "unknown";
      return `Agent started`;
    }
  }

  // Generic: look for a message or text field
  if (typeof obj.message === "string" && obj.message) return obj.message;
  if (typeof obj.text === "string" && obj.text) return obj.text;
  if (typeof obj.error === "string" && obj.error) return `Error: ${obj.error}`;

  // No human-readable content found — skip this line in human mode
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function AgentDetail() {
  const { companyPrefix, agentId, tab: urlTab, runId: urlRunId } = useParams<{
    companyPrefix?: string;
    agentId: string;
    tab?: string;
    runId?: string;
  }>();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { closePanel } = usePanel();
  const { openNewIssue } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const activeView = urlRunId ? "runs" as AgentDetailView : parseAgentDetailView(urlTab ?? null);
  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const saveConfigActionRef = useRef<(() => void) | null>(null);
  const cancelConfigActionRef = useRef<(() => void) | null>(null);
  const { isMobile } = useSidebar();
  const routeAgentRef = agentId ?? "";
  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix)?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? undefined;
  const canFetchAgent = routeAgentRef.length > 0 && (isUuidLike(routeAgentRef) || Boolean(lookupCompanyId));
  const setSaveConfigAction = useCallback((fn: (() => void) | null) => { saveConfigActionRef.current = fn; }, []);
  const setCancelConfigAction = useCallback((fn: (() => void) | null) => { cancelConfigActionRef.current = fn; }, []);

  const { data: agent, isLoading, error } = useQuery({
    queryKey: [...queryKeys.agents.detail(routeAgentRef), lookupCompanyId ?? null],
    queryFn: () => agentsApi.get(routeAgentRef, lookupCompanyId),
    enabled: canFetchAgent,
  });
  const resolvedCompanyId = agent?.companyId ?? selectedCompanyId;
  const canonicalAgentRef = agent ? agentRouteRef(agent) : routeAgentRef;
  const agentLookupRef = agent?.id ?? routeAgentRef;

  const { data: runtimeState } = useQuery({
    queryKey: queryKeys.agents.runtimeState(agentLookupRef),
    queryFn: () => agentsApi.runtimeState(agentLookupRef, resolvedCompanyId ?? undefined),
    enabled: Boolean(agentLookupRef),
  });

  const { data: heartbeats } = useQuery({
    queryKey: queryKeys.heartbeats(resolvedCompanyId!, agent?.id ?? undefined),
    queryFn: () => heartbeatsApi.list(resolvedCompanyId!, agent?.id ?? undefined),
    enabled: !!resolvedCompanyId && !!agent?.id,
  });

  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(resolvedCompanyId!),
    queryFn: () => issuesApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });

  const { data: allAgents } = useQuery({
    queryKey: queryKeys.agents.list(resolvedCompanyId!),
    queryFn: () => agentsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });

  const assignedIssues = (allIssues ?? [])
    .filter((i) => i.assigneeAgentId === agent?.id)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const reportsToAgent = (allAgents ?? []).find((a) => a.id === agent?.reportsTo);
  const directReports = (allAgents ?? []).filter((a) => a.reportsTo === agent?.id && a.status !== "terminated");
  const mobileLiveRun = useMemo(
    () => (heartbeats ?? []).find((r) => r.status === "running" || r.status === "queued") ?? null,
    [heartbeats],
  );

  useEffect(() => {
    if (!agent) return;
    if (routeAgentRef === canonicalAgentRef) return;
    if (urlRunId) {
      navigate(`/agents/${canonicalAgentRef}/runs/${urlRunId}`, { replace: true });
      return;
    }
    if (urlTab) {
      navigate(`/agents/${canonicalAgentRef}/${urlTab}`, { replace: true });
      return;
    }
    navigate(`/agents/${canonicalAgentRef}`, { replace: true });
  }, [agent, routeAgentRef, canonicalAgentRef, urlRunId, urlTab, navigate]);

  useEffect(() => {
    if (!agent?.companyId || agent.companyId === selectedCompanyId) return;
    setSelectedCompanyId(agent.companyId, { source: "route_sync" });
  }, [agent?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const agentAction = useMutation({
    mutationFn: async (action: "invoke" | "pause" | "resume" | "terminate") => {
      if (!agentLookupRef) return Promise.reject(new Error("No agent reference"));
      switch (action) {
        case "invoke": return agentsApi.invoke(agentLookupRef, resolvedCompanyId ?? undefined);
        case "pause": return agentsApi.pause(agentLookupRef, resolvedCompanyId ?? undefined);
        case "resume": return agentsApi.resume(agentLookupRef, resolvedCompanyId ?? undefined);
        case "terminate": return agentsApi.terminate(agentLookupRef, resolvedCompanyId ?? undefined);
      }
    },
    onSuccess: (data, action) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(routeAgentRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentLookupRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.runtimeState(agentLookupRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.taskSessions(agentLookupRef) });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
        if (agent?.id) {
          queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(resolvedCompanyId, agent.id) });
        }
      }
      if (action === "invoke" && data && typeof data === "object" && "id" in data) {
        navigate(`/agents/${canonicalAgentRef}/runs/${(data as HeartbeatRun).id}`);
      }
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Action failed");
    },
  });

  const updateIcon = useMutation({
    mutationFn: (icon: string) => agentsApi.update(agentLookupRef, { icon }, resolvedCompanyId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(routeAgentRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentLookupRef) });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
      }
    },
  });

  const updatePermissions = useMutation({
    mutationFn: (canCreateAgents: boolean) =>
      agentsApi.updatePermissions(agentLookupRef, { canCreateAgents }, resolvedCompanyId ?? undefined),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(routeAgentRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentLookupRef) });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
      }
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to update permissions");
    },
  });

  useEffect(() => {
    const crumbs: { label: string; href?: string }[] = [
      { label: "Team", href: "/agents" },
    ];
    const agentName = agent?.name ?? routeAgentRef ?? "Team Member";
    if (activeView === "overview" && !urlRunId) {
      crumbs.push({ label: agentName });
    } else {
      crumbs.push({ label: agentName, href: `/agents/${canonicalAgentRef}` });
      if (urlRunId) {
        crumbs.push({ label: "Runs", href: `/agents/${canonicalAgentRef}/runs` });
        crumbs.push({ label: `Run ${urlRunId.slice(0, 8)}` });
      } else if (activeView === "configure") {
        crumbs.push({ label: "Configure" });
      } else if (activeView === "runs") {
        crumbs.push({ label: "Runs" });
      }
    }
    setBreadcrumbs(crumbs);
  }, [setBreadcrumbs, agent, routeAgentRef, canonicalAgentRef, activeView, urlRunId]);

  useEffect(() => {
    closePanel();
    return () => closePanel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useBeforeUnload(
    useCallback((event) => {
      if (!configDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }, [configDirty]),
  );

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!agent) return null;
  const isPendingApproval = agent.status === "pending_approval";
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <AgentIconPicker
            value={agent.icon}
            onChange={(icon) => updateIcon.mutate(icon)}
          >
            <button className="shrink-0 relative flex items-center justify-center h-14 w-14 rounded-xl bg-accent/80 hover:bg-accent transition-all group shadow-xs">
              <AgentIcon icon={agent.icon} className="h-7 w-7 transition-transform group-hover:scale-110" />
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background",
                agent.status === "active" ? "bg-emerald-500" :
                agent.status === "running" ? "bg-indigo-500 animate-pulse" :
                agent.status === "paused" ? "bg-orange-400" :
                agent.status === "error" ? "bg-red-500" :
                "bg-neutral-400"
              )} />
            </button>
          </AgentIconPicker>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight truncate">{agent.name}</h1>
              <StatusBadge status={agent.status} />
            </div>
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {roleLabels[agent.role] ?? agent.role}
              {agent.title ? ` · ${agent.title}` : ""}
            </p>
          </div>
          {mobileLiveRun && (
            <Link
              to={`/agents/${canonicalAgentRef}/runs/${mobileLiveRun.id}`}
              className="sm:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors no-underline"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
              </span>
              <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">Live</span>
            </Link>
          )}
        </div>

        {/* Primary actions + More dropdown */}
        <div className="flex items-center gap-2">
          {/* Start / Resume button */}
          <Button
            size="sm"
            onClick={() => agentAction.mutate(agent.status === "paused" ? "resume" : "invoke")}
            disabled={agentAction.isPending || isPendingApproval}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {agent.status === "paused" ? "Resume" : "Start"}
          </Button>

          {/* Pause button (only when not already paused) */}
          {agent.status !== "paused" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => agentAction.mutate("pause")}
              disabled={agentAction.isPending || isPendingApproval}
            >
              <Pause className="h-3.5 w-3.5 mr-1.5" />
              Pause
            </Button>
          )}

          {/* More dropdown */}
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="end">
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover:bg-accent/40"
                onClick={() => {
                  openNewIssue({ assigneeAgentId: agent.id });
                  setMoreOpen(false);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Assign Task
              </button>
              <div className="h-px bg-border my-1" />
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover:bg-accent/40"
                onClick={() => {
                  navigate(`/agents/${canonicalAgentRef}/configure`);
                  setMoreOpen(false);
                }}
              >
                <Settings className="h-3.5 w-3.5" />
                Configure
              </button>
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover:bg-accent/40"
                onClick={() => {
                  navigator.clipboard.writeText(agent.id);
                  setMoreOpen(false);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy ID
              </button>
              <div className="h-px bg-border my-1" />
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded hover:bg-accent/40 text-destructive"
                onClick={() => {
                  agentAction.mutate("terminate");
                  setMoreOpen(false);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Terminate
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      {isPendingApproval && (
        <p className="text-sm text-amber-500">
          This agent is pending board approval and cannot be invoked yet.
        </p>
      )}

      {/* View content */}
      {activeView === "overview" && (
        <AgentOverview
          agent={agent}
          runs={heartbeats ?? []}
          assignedIssues={assignedIssues}
          runtimeState={runtimeState}
          reportsToAgent={reportsToAgent ?? null}
          directReports={directReports}
          agentId={agent.id}
          agentRouteId={canonicalAgentRef}
        />
      )}

      {activeView === "configure" && (
        <AgentConfigurePage
          agent={agent}
          agentId={agent.id}
          companyId={resolvedCompanyId ?? undefined}
          onDirtyChange={setConfigDirty}
          onSaveActionChange={setSaveConfigAction}
          onCancelActionChange={setCancelConfigAction}
          onSavingChange={setConfigSaving}
          updatePermissions={updatePermissions}
        />
      )}

      {activeView === "runs" && (
        <RunsTab
          runs={heartbeats ?? []}
          companyId={resolvedCompanyId!}
          agentId={agent.id}
          agentRouteId={canonicalAgentRef}
          selectedRunId={urlRunId ?? null}
          adapterType={agent.adapterType}
        />
      )}
    </div>
  );
}

/* ---- Helper components ---- */

function LatestRunCard({ runs, agentId }: { runs: HeartbeatRun[]; agentId: string }) {
  if (runs.length === 0) return null;

  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const liveRun = sorted.find((r) => r.status === "running" || r.status === "queued");
  const run = liveRun ?? sorted[0];
  const isLive = run.status === "running" || run.status === "queued";
  const statusInfo = runStatusIcons[run.status] ?? { icon: Clock, color: "text-neutral-400" };
  const StatusIcon = statusInfo.icon;
  const summary = run.resultJson
    ? String((run.resultJson as Record<string, unknown>).summary ?? (run.resultJson as Record<string, unknown>).result ?? "")
    : run.error ?? "";

  const metrics = runMetrics(run);

  return (
    <div className="space-y-2.5">
      <div className="flex w-full items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {isLive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
          )}
          {isLive ? "Live Run" : "Latest Run"}
        </h3>
        <Link
          to={`/agents/${agentId}/runs`}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors no-underline"
        >
          All runs &rarr;
        </Link>
      </div>

      <Link
        to={`/agents/${agentId}/runs/${run.id}`}
        className={cn(
          "block border rounded-xl p-4 w-full no-underline transition-all hover:border-border/80 cursor-pointer group",
          isLive
            ? "border-cyan-500/30 bg-cyan-500/[0.03] shadow-[0_0_16px_rgba(6,182,212,0.06)]"
            : "border-border bg-card hover:bg-accent/30"
        )}
      >
        {/* Top row: status + source + time */}
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("h-4 w-4", statusInfo.color, run.status === "running" && "animate-spin")} />
          <StatusBadge status={run.status} />
          <span className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            run.invocationSource === "timer" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
              : run.invocationSource === "assignment" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"
              : run.invocationSource === "on_demand" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300"
              : "bg-muted text-muted-foreground"
          )}>
            {sourceLabels[run.invocationSource] ?? run.invocationSource}
          </span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{relativeTime(run.createdAt)}</span>
        </div>

        {/* Summary */}
        {summary && (
          <div className="overflow-hidden max-h-20 mt-2.5 pl-6">
            <MarkdownBody className="text-sm text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{summary}</MarkdownBody>
          </div>
        )}

        {/* Bottom metrics row */}
        {(metrics.cost > 0 || metrics.totalTokens > 0) && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30 pl-6">
            {metrics.cost > 0 && (
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">${metrics.cost.toFixed(2)}</span> cost
              </span>
            )}
            {metrics.totalTokens > 0 && (
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">{formatTokens(metrics.totalTokens)}</span> tokens
              </span>
            )}
            {metrics.input > 0 && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {formatTokens(metrics.input)} in / {formatTokens(metrics.output)} out
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              View details &rarr;
            </span>
          </div>
        )}
      </Link>
    </div>
  );
}

/* ---- Agent Overview (main single-page view) ---- */

function AgentOverview({
  agent,
  runs,
  assignedIssues,
  runtimeState,
  reportsToAgent,
  directReports,
  agentId,
  agentRouteId,
}: {
  agent: Agent;
  runs: HeartbeatRun[];
  assignedIssues: { id: string; title: string; status: string; priority: string; identifier?: string | null; createdAt: Date }[];
  runtimeState?: AgentRuntimeState;
  reportsToAgent: Agent | null;
  directReports: Agent[];
  agentId: string;
  agentRouteId: string;
}) {
  // Compute summary stats for the overview header
  const totalRuns = runs.length;
  const succeededRuns = runs.filter(r => r.status === "succeeded").length;
  const successRate = totalRuns > 0 ? Math.round((succeededRuns / totalRuns) * 100) : 0;
  const openTasks = assignedIssues.filter(i => i.status !== "done" && i.status !== "cancelled").length;
  const doneTasks = assignedIssues.filter(i => i.status === "done").length;

  return (
    <div className="space-y-6">
      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="px-3.5 py-3 rounded-lg border border-border bg-card">
          <div className="text-2xl font-bold tracking-tight tabular-nums">{totalRuns}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Runs</div>
        </div>
        <div className="px-3.5 py-3 rounded-lg border border-border bg-card">
          <div className="text-2xl font-bold tracking-tight tabular-nums">
            {totalRuns > 0 ? `${successRate}%` : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Success Rate</div>
        </div>
        <div className="px-3.5 py-3 rounded-lg border border-border bg-card">
          <div className="text-2xl font-bold tracking-tight tabular-nums">{openTasks}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Open Tasks</div>
        </div>
        <div className="px-3.5 py-3 rounded-lg border border-border bg-card">
          <div className="text-2xl font-bold tracking-tight tabular-nums">
            {runtimeState ? formatCents(runtimeState.totalCostCents) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Cost</div>
        </div>
      </div>

      {/* Latest Run */}
      <LatestRunCard runs={runs} agentId={agentRouteId} />

      {/* Charts */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Activity</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ChartCard title="Total cost" subtitle={runtimeState ? `${formatCents(runtimeState.totalCostCents)} across ${runs.length} runs` : "Last 14 days"}>
            <TotalCostChart runs={runs} />
          </ChartCard>
          <ChartCard title="Cost per task" subtitle={runs.length > 0 && runtimeState ? `${formatCents(Math.round(runtimeState.totalCostCents / runs.length))} avg` : "Last 14 days"}>
            <CostPerRunChart runs={runs} />
          </ChartCard>
          <ChartCard title="Tasks by Status" subtitle="Last 14 days">
            <IssueStatusChart issues={assignedIssues} />
          </ChartCard>
          <ChartCard title="Success Rate" subtitle="Last 14 days">
            <SuccessRateChart runs={runs} />
          </ChartCard>
        </div>
      </div>

      {/* Recent Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Recent Tasks
            {assignedIssues.length > 0 && (
              <span className="ml-2 text-xs font-normal tabular-nums">{doneTasks}/{assignedIssues.length} done</span>
            )}
          </h3>
          <Link to={`/issues?assignee=${agentId}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors no-underline">
            See all &rarr;
          </Link>
        </div>
        {assignedIssues.length === 0 ? (
          <div className="border border-dashed border-border/50 rounded-xl py-8 text-center">
            <p className="text-sm text-muted-foreground">No assigned tasks yet</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            {assignedIssues.slice(0, 10).map((issue) => (
              <EntityRow
                key={issue.id}
                identifier={issue.identifier ?? issue.id.slice(0, 8)}
                title={issue.title}
                to={`/issues/${issue.identifier ?? issue.id}`}
                leading={<IssueStatusIcon status={issue.status} />}
                trailing={<StatusBadge status={issue.status} />}
              />
            ))}
            {assignedIssues.length > 10 && (
              <div className="px-3 py-2.5 text-xs text-muted-foreground text-center border-t border-border bg-muted/20">
                +{assignedIssues.length - 10} more tasks
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}



/* ---- Agent Configure Page ---- */

function AgentConfigurePage({
  agent,
  agentId,
  companyId,
  onDirtyChange,
  onSaveActionChange,
  onCancelActionChange,
  onSavingChange,
  updatePermissions,
}: {
  agent: Agent;
  agentId: string;
  companyId?: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaveActionChange: (save: (() => void) | null) => void;
  onCancelActionChange: (cancel: (() => void) | null) => void;
  onSavingChange: (saving: boolean) => void;
  updatePermissions: { mutate: (canCreate: boolean) => void; isPending: boolean };
}) {
  const queryClient = useQueryClient();
  const [revisionsOpen, setRevisionsOpen] = useState(false);


  const { data: configRevisions } = useQuery({
    queryKey: queryKeys.agents.configRevisions(agent.id),
    queryFn: () => agentsApi.listConfigRevisions(agent.id, companyId),
  });

  const rollbackConfig = useMutation({
    mutationFn: (revisionId: string) => agentsApi.rollbackConfigRevision(agent.id, revisionId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.urlKey) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.configRevisions(agent.id) });
    },
  });

  return (
    <div className="space-y-8">
      <ConfigurationTab
        agent={agent}
        onDirtyChange={onDirtyChange}
        onSaveActionChange={onSaveActionChange}
        onCancelActionChange={onCancelActionChange}
        onSavingChange={onSavingChange}
        updatePermissions={updatePermissions}
        companyId={companyId}
      />

      {/* Configuration Revisions — collapsible */}
      <div>
        <button
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          onClick={() => setRevisionsOpen((v) => !v)}
        >
          {revisionsOpen
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />
          }
          Configuration Revisions
          <span className="text-xs font-normal tabular-nums">{configRevisions?.length ?? 0}</span>
        </button>
        {revisionsOpen && (
          <div className="mt-3">
            {(configRevisions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No configuration revisions yet.</p>
            ) : (
              <div className="space-y-2">
                {(configRevisions ?? []).slice(0, 10).map((revision) => (
                  <div key={revision.id} className="border border-border/40 rounded-lg bg-card/50 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{revision.id.slice(0, 8)}</span>
                        <span className="mx-1">·</span>
                        <span>{formatDate(revision.createdAt)}</span>
                        <span className="mx-1">·</span>
                        <span>{revision.source}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => rollbackConfig.mutate(revision.id)}
                        disabled={rollbackConfig.isPending}
                      >
                        Restore
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Changed:{" "}
                      {revision.changedKeys.length > 0 ? revision.changedKeys.join(", ") : "no tracked changes"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Configuration Tab ---- */

function ConfigurationTab({
  agent,
  companyId,
  onDirtyChange,
  onSaveActionChange,
  onCancelActionChange,
  onSavingChange,
  updatePermissions,
}: {
  agent: Agent;
  companyId?: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaveActionChange: (save: (() => void) | null) => void;
  onCancelActionChange: (cancel: (() => void) | null) => void;
  onSavingChange: (saving: boolean) => void;
  updatePermissions: { mutate: (canCreate: boolean) => void; isPending: boolean };
}) {
  const queryClient = useQueryClient();

  const { data: adapterModels } = useQuery({
    queryKey: ["adapter-models", agent.adapterType],
    queryFn: () => agentsApi.adapterModels(agent.adapterType),
  });

  const updateAgent = useMutation({
    mutationFn: (data: Record<string, unknown>) => agentsApi.update(agent.id, data, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.urlKey) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.configRevisions(agent.id) });
    },
  });

  useEffect(() => {
    onSavingChange(updateAgent.isPending);
  }, [onSavingChange, updateAgent.isPending]);

  const permissionsSlot = (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Permissions</h3>
      <div className="border border-border rounded-xl bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">Can create new agents</span>
          <button
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
              agent.permissions?.canCreateAgents ? "bg-green-600" : "bg-muted",
              updatePermissions.isPending && "opacity-50 pointer-events-none"
            )}
            onClick={() =>
              updatePermissions.mutate(!Boolean(agent.permissions?.canCreateAgents))
            }
            disabled={updatePermissions.isPending}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-xs",
                agent.permissions?.canCreateAgents ? "translate-x-4.5" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <AgentConfigForm
      mode="edit"
      agent={agent}
      onSave={(patch) => updateAgent.mutate(patch)}
      isSaving={updateAgent.isPending}
      adapterModels={adapterModels}
      onDirtyChange={onDirtyChange}
      onSaveActionChange={onSaveActionChange}
      onCancelActionChange={onCancelActionChange}
      sectionLayout="cards"
      afterScheduleSlot={permissionsSlot}
    />
  );
}

/* ---- Runs Tab ---- */

function RunListItem({ run, isSelected, agentId }: { run: HeartbeatRun; isSelected: boolean; agentId: string }) {
  const statusInfo = runStatusIcons[run.status] ?? { icon: Clock, color: "text-neutral-400" };
  const StatusIcon = statusInfo.icon;
  const metrics = runMetrics(run);
  const summary = run.resultJson
    ? String((run.resultJson as Record<string, unknown>).summary ?? (run.resultJson as Record<string, unknown>).result ?? "")
    : run.error ?? "";

  return (
    <Link
      to={isSelected ? `/agents/${agentId}/runs` : `/agents/${agentId}/runs/${run.id}`}
      className={cn(
        "flex flex-col gap-1 w-full px-3 py-2.5 text-left border-b border-border/50 last:border-b-0 transition-colors no-underline text-inherit",
        isSelected ? "bg-accent/40" : "hover:bg-accent/20",
      )}
    >
      <div className="flex items-center gap-2">
        <StatusIcon className={cn("h-4 w-4 shrink-0", statusInfo.color, run.status === "running" && "animate-spin")} />
        <span className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
          run.invocationSource === "timer" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
            : run.invocationSource === "assignment" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"
            : run.invocationSource === "on_demand" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300"
            : "bg-muted text-muted-foreground"
        )}>
          {sourceLabels[run.invocationSource] ?? run.invocationSource}
        </span>
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {relativeTime(run.createdAt)}
        </span>
      </div>
      {summary && (
        <span className="text-sm text-muted-foreground truncate pl-6">
          {summary.slice(0, 80)}
        </span>
      )}
      {metrics.cost > 0 && (
        <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
          <span>${metrics.cost.toFixed(3)}</span>
        </div>
      )}
    </Link>
  );
}

function RunsTab({
  runs,
  companyId,
  agentId,
  agentRouteId,
  selectedRunId,
  adapterType,
}: {
  runs: HeartbeatRun[];
  companyId: string;
  agentId: string;
  agentRouteId: string;
  selectedRunId: string | null;
  adapterType: string;
}) {
  const { isMobile } = useSidebar();

  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs yet.</p>;
  }

  // Sort by created descending
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // On mobile, don't auto-select so the list shows first; on desktop, auto-select latest
  const effectiveRunId = isMobile ? selectedRunId : (selectedRunId ?? sorted[0]?.id ?? null);
  const selectedRun = sorted.find((r) => r.id === effectiveRunId) ?? null;

  // Mobile: show either run list OR run detail with back button
  if (isMobile) {
    if (selectedRun) {
      return (
        <div className="space-y-3 min-w-0 overflow-x-hidden">
          <Link
            to={`/agents/${agentRouteId}/runs`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors no-underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to runs
          </Link>
          <RunDetail key={selectedRun.id} run={selectedRun} agentRouteId={agentRouteId} adapterType={adapterType} />
        </div>
      );
    }
    return (
      <div className="border border-border/50 rounded-xl overflow-x-hidden">
        {sorted.map((run) => (
          <RunListItem key={run.id} run={run} isSelected={false} agentId={agentRouteId} />
        ))}
      </div>
    );
  }

  // Desktop: side-by-side layout
  return (
    <div className="flex gap-0">
      {/* Left: run list — border stretches full height, content sticks */}
      <div className={cn(
        "shrink-0 border border-border/50 rounded-xl",
        selectedRun ? "w-72" : "w-full",
      )}>
        <div className="sticky top-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 2rem)" }}>
        {sorted.map((run) => (
          <RunListItem key={run.id} run={run} isSelected={run.id === effectiveRunId} agentId={agentRouteId} />
        ))}
        </div>
      </div>

      {/* Right: run detail — natural height, page scrolls */}
      {selectedRun && (
        <div className="flex-1 min-w-0 pl-4">
          <RunDetail key={selectedRun.id} run={selectedRun} agentRouteId={agentRouteId} adapterType={adapterType} />
        </div>
      )}
    </div>
  );
}

/* ---- Run Detail (expanded) ---- */

function RunDetail({ run, agentRouteId, adapterType }: { run: HeartbeatRun; agentRouteId: string; adapterType: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const metrics = runMetrics(run);
  const [claudeLoginResult, setClaudeLoginResult] = useState<ClaudeLoginResult | null>(null);

  useEffect(() => {
    setClaudeLoginResult(null);
  }, [run.id]);

  const cancelRun = useMutation({
    mutationFn: () => heartbeatsApi.cancel(run.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(run.companyId, run.agentId) });
    },
  });
  const canResumeLostRun = run.errorCode === "process_lost" && run.status === "failed";
  const resumePayload = useMemo(() => {
    const payload: Record<string, unknown> = {
      resumeFromRunId: run.id,
    };
    const context = asRecord(run.contextSnapshot);
    if (!context) return payload;
    const issueId = asNonEmptyString(context.issueId);
    const taskId = asNonEmptyString(context.taskId);
    const taskKey = asNonEmptyString(context.taskKey);
    const commentId = asNonEmptyString(context.wakeCommentId) ?? asNonEmptyString(context.commentId);
    if (issueId) payload.issueId = issueId;
    if (taskId) payload.taskId = taskId;
    if (taskKey) payload.taskKey = taskKey;
    if (commentId) payload.commentId = commentId;
    return payload;
  }, [run.contextSnapshot, run.id]);
  const resumeRun = useMutation({
    mutationFn: async () => {
      const result = await agentsApi.wakeup(run.agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "resume_process_lost_run",
        payload: resumePayload,
      }, run.companyId);
      if (!("id" in result)) {
        throw new Error("Resume request was skipped because the agent is not currently invokable.");
      }
      return result;
    },
    onSuccess: (resumedRun) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(run.companyId, run.agentId) });
      navigate(`/agents/${agentRouteId}/runs/${resumedRun.id}`);
    },
  });

  const canRetryRun = run.status === "failed" || run.status === "timed_out";
  const retryPayload = useMemo(() => {
    const payload: Record<string, unknown> = {};
    const context = asRecord(run.contextSnapshot);
    if (!context) return payload;
    const issueId = asNonEmptyString(context.issueId);
    const taskId = asNonEmptyString(context.taskId);
    const taskKey = asNonEmptyString(context.taskKey);
    if (issueId) payload.issueId = issueId;
    if (taskId) payload.taskId = taskId;
    if (taskKey) payload.taskKey = taskKey;
    return payload;
  }, [run.contextSnapshot]);
  const retryRun = useMutation({
    mutationFn: async () => {
      const result = await agentsApi.wakeup(run.agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "retry_failed_run",
        payload: retryPayload,
      }, run.companyId);
      if (!("id" in result)) {
        throw new Error("Retry was skipped because the agent is not currently invokable.");
      }
      return result;
    },
    onSuccess: (newRun) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(run.companyId, run.agentId) });
      navigate(`/agents/${agentRouteId}/runs/${newRun.id}`);
    },
  });

  const { data: touchedIssues } = useQuery({
    queryKey: queryKeys.runIssues(run.id),
    queryFn: () => activityApi.issuesForRun(run.id),
  });
  const touchedIssueIds = useMemo(
    () => Array.from(new Set((touchedIssues ?? []).map((issue) => issue.issueId))),
    [touchedIssues],
  );

  const runClaudeLogin = useMutation({
    mutationFn: () => agentsApi.loginWithClaude(run.agentId, run.companyId),
    onSuccess: (data) => {
      setClaudeLoginResult(data);
    },
  });

  const isRunning = run.status === "running" && !!run.startedAt && !run.finishedAt;
  const [elapsedSec, setElapsedSec] = useState<number>(() => {
    if (!run.startedAt) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000));
  });

  useEffect(() => {
    if (!isRunning || !run.startedAt) return;
    const startMs = new Date(run.startedAt).getTime();
    setElapsedSec(Math.max(0, Math.round((Date.now() - startMs) / 1000)));
    const id = setInterval(() => {
      setElapsedSec(Math.max(0, Math.round((Date.now() - startMs) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, run.startedAt]);

  const durationSec = run.startedAt && run.finishedAt
    ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : null;
  const displayDurationSec = durationSec ?? (isRunning ? elapsedSec : null);
  const hasMetrics = metrics.input > 0 || metrics.output > 0 || metrics.cached > 0 || metrics.cost > 0;

  const [logMode, setLogMode] = useState<"human" | "raw">("human");

  return (
    <div className="space-y-4 min-w-0">
      {/* Tasks touched — shown as heading context */}
      {touchedIssues && touchedIssues.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-muted-foreground">Tasks ({touchedIssues.length})</span>
          <div className="border border-border/50 rounded-xl divide-y divide-border/50">
            {touchedIssues.map((issue) => (
              <Link
                key={issue.issueId}
                to={`/issues/${issue.identifier ?? issue.issueId}`}
                className="flex items-center justify-between w-full px-3 py-2.5 text-sm hover:bg-accent/20 transition-colors text-left no-underline text-inherit"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StatusBadge status={issue.status} />
                  <span className="truncate">{issue.title}</span>
                </div>
                {issue.identifier && <span className="text-xs text-muted-foreground shrink-0 ml-2">{issue.identifier}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Run summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge status={run.status} className="text-sm px-3 py-1" />
        {displayDurationSec !== null && (
          <span className="text-sm text-muted-foreground">
            {displayDurationSec >= 60 ? `${Math.floor(displayDurationSec / 60)}m ${displayDurationSec % 60}s` : `${displayDurationSec}s`}
          </span>
        )}
        {hasMetrics && metrics.cost > 0 && (
          <span className="text-sm text-muted-foreground">${metrics.cost.toFixed(4)}</span>
        )}
        {(run.status === "running" || run.status === "queued") && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => cancelRun.mutate()}
            disabled={cancelRun.isPending}
          >
            {cancelRun.isPending ? "Cancelling…" : "Cancel"}
          </Button>
        )}
        {canResumeLostRun && (
          <Button variant="outline" size="sm" onClick={() => resumeRun.mutate()} disabled={resumeRun.isPending}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {resumeRun.isPending ? "Resuming…" : "Resume"}
          </Button>
        )}
        {canRetryRun && !canResumeLostRun && (
          <Button variant="outline" size="sm" onClick={() => retryRun.mutate()} disabled={retryRun.isPending}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            {retryRun.isPending ? "Retrying…" : "Retry"}
          </Button>
        )}
      </div>
      {resumeRun.isError && (
        <div className="text-xs text-destructive">{resumeRun.error instanceof Error ? resumeRun.error.message : "Failed to resume run"}</div>
      )}
      {retryRun.isError && (
        <div className="text-xs text-destructive">{retryRun.error instanceof Error ? retryRun.error.message : "Failed to retry run"}</div>
      )}
      {run.error && !run.logRef && (
        <div className="text-xs">
          <span className="text-red-600 dark:text-red-400">{run.error}</span>
        </div>
      )}
      {run.errorCode === "claude_auth_required" && adapterType === "claude_local" && (
        <div className="space-y-2">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => runClaudeLogin.mutate()} disabled={runClaudeLogin.isPending}>
            {runClaudeLogin.isPending ? "Running claude login..." : "Login to Claude Code"}
          </Button>
          {runClaudeLogin.isError && (
            <p className="text-xs text-destructive">{runClaudeLogin.error instanceof Error ? runClaudeLogin.error.message : "Failed to run Claude login"}</p>
          )}
          {claudeLoginResult?.loginUrl && (
            <p className="text-xs">
              Login URL:
              <a href={claudeLoginResult.loginUrl} className="text-blue-600 underline underline-offset-2 ml-1 break-all dark:text-blue-400" target="_blank" rel="noreferrer">
                {claudeLoginResult.loginUrl}
              </a>
            </p>
          )}
        </div>
      )}

      {/* stderr excerpt — only when no full transcript log is available */}
      {run.stderrExcerpt && !run.logRef && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-300">Warnings</span>
          <pre className="text-sm text-red-600 dark:text-red-300 whitespace-pre-wrap break-words overflow-x-auto">{run.stderrExcerpt}</pre>
        </div>
      )}

      {/* stdout excerpt — only when no full transcript log is available */}
      {run.stdoutExcerpt && !run.logRef && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</span>
          <pre className="text-sm text-foreground whitespace-pre-wrap break-words overflow-x-auto">{run.stdoutExcerpt}</pre>
        </div>
      )}

      {/* Log viewer */}
      <LogViewer run={run} adapterType={adapterType} logMode={logMode} onLogModeChange={setLogMode} />
    </div>
  );
}

/* ---- Log Viewer ---- */

function LogViewer({ run, adapterType, logMode, onLogModeChange }: { run: HeartbeatRun; adapterType: string; logMode: "human" | "raw"; onLogModeChange: (mode: "human" | "raw") => void }) {
  const [events, setEvents] = useState<HeartbeatRunEvent[]>([]);
  const [logLines, setLogLines] = useState<Array<{ ts: string; stream: "stdout" | "stderr" | "system"; chunk: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(!!run.logRef);
  const [logError, setLogError] = useState<string | null>(null);
  const [logOffset, setLogOffset] = useState(0);
  const pendingLogLineRef = useRef("");
  const isLive = run.status === "running" || run.status === "queued";

  function appendLogContent(content: string, finalize = false) {
    if (!content && !finalize) return;
    const combined = `${pendingLogLineRef.current}${content}`;
    const split = combined.split("\n");
    pendingLogLineRef.current = split.pop() ?? "";
    if (finalize && pendingLogLineRef.current) {
      split.push(pendingLogLineRef.current);
      pendingLogLineRef.current = "";
    }

    const parsed: Array<{ ts: string; stream: "stdout" | "stderr" | "system"; chunk: string }> = [];
    for (const line of split) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const raw = JSON.parse(trimmed) as { ts?: unknown; stream?: unknown; chunk?: unknown };
        const stream =
          raw.stream === "stderr" || raw.stream === "system" ? raw.stream : "stdout";
        const chunk = typeof raw.chunk === "string" ? raw.chunk : "";
        const ts = typeof raw.ts === "string" ? raw.ts : new Date().toISOString();
        if (!chunk) continue;
        parsed.push({ ts, stream, chunk });
      } catch {
        // ignore malformed lines
      }
    }

    if (parsed.length > 0) {
      setLogLines((prev) => [...prev, ...parsed]);
    }
  }

  // Fetch events
  const { data: initialEvents } = useQuery({
    queryKey: ["run-events", run.id],
    queryFn: () => heartbeatsApi.events(run.id, 0, 200),
  });

  useEffect(() => {
    if (initialEvents) {
      setEvents(initialEvents);
      setLoading(false);
    }
  }, [initialEvents]);

  // Fetch persisted shell log
  useEffect(() => {
    let cancelled = false;
    pendingLogLineRef.current = "";
    setLogLines([]);
    setLogOffset(0);
    setLogError(null);

    if (!run.logRef) {
      setLogLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLogLoading(true);
    const firstLimit =
      typeof run.logBytes === "number" && run.logBytes > 0
        ? Math.min(Math.max(run.logBytes + 1024, 256_000), 2_000_000)
        : 256_000;

    const load = async () => {
      try {
        let offset = 0;
        let first = true;
        while (!cancelled) {
          const result = await heartbeatsApi.log(run.id, offset, first ? firstLimit : 256_000);
          if (cancelled) break;
          appendLogContent(result.content, result.nextOffset === undefined);
          const next = result.nextOffset ?? offset + result.content.length;
          setLogOffset(next);
          offset = next;
          first = false;
          if (result.nextOffset === undefined || isLive) break;
        }
      } catch (err) {
        if (!cancelled) {
          setLogError(err instanceof Error ? err.message : "Failed to load run log");
        }
      } finally {
        if (!cancelled) setLogLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [run.id, run.logRef, run.logBytes, isLive]);

  // Poll for live updates
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(async () => {
      const maxSeq = events.length > 0 ? Math.max(...events.map((e) => e.seq)) : 0;
      try {
        const newEvents = await heartbeatsApi.events(run.id, maxSeq, 100);
        if (newEvents.length > 0) {
          setEvents((prev) => [...prev, ...newEvents]);
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [run.id, isLive, events]);

  // Poll shell log for running runs
  useEffect(() => {
    if (!isLive || !run.logRef) return;
    const interval = setInterval(async () => {
      try {
        const result = await heartbeatsApi.log(run.id, logOffset, 256_000);
        if (result.content) {
          appendLogContent(result.content, result.nextOffset === undefined);
        }
        if (result.nextOffset !== undefined) {
          setLogOffset(result.nextOffset);
        } else if (result.content.length > 0) {
          setLogOffset((prev) => prev + result.content.length);
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [run.id, run.logRef, isLive, logOffset]);

  const adapter = useMemo(() => getUIAdapter(adapterType), [adapterType]);
  const transcript = useMemo(() => buildTranscript(logLines, adapter.parseStdoutLine), [logLines, adapter]);

  if (loading && logLoading) {
    return <p className="text-xs text-muted-foreground">Loading run logs...</p>;
  }

  if (events.length === 0 && logLines.length === 0 && !logError) {
    return <p className="text-xs text-muted-foreground">No log events.</p>;
  }

  const levelColors: Record<string, string> = {
    info: "text-foreground",
    warn: "text-yellow-600 dark:text-yellow-400",
    error: "text-red-600 dark:text-red-400",
  };

  const streamColors: Record<string, string> = {
    stdout: "text-foreground",
    stderr: "text-red-600 dark:text-red-300",
    system: "text-blue-600 dark:text-blue-300",
  };

  // Merge consecutive stderr entries with the same timestamp into a single entry
  const dedupedTranscript = transcript.reduce<typeof transcript>((acc, entry) => {
    if (entry.kind === "stderr" && acc.length > 0) {
      const prev = acc[acc.length - 1];
      if (prev.kind === "stderr" && prev.ts === entry.ts) {
        acc[acc.length - 1] = { ...prev, text: prev.text + "\n" + entry.text };
        return acc;
      }
    }
    acc.push(entry);
    return acc;
  }, []);
  const displayEntries = [...dedupedTranscript].reverse();
  const humanVisibleCount = dedupedTranscript.filter((e) => {
    if (e.kind === "system" || e.kind === "tool_call" || e.kind === "result") return false;
    if (e.kind === "tool_result" && !e.isError) return false;
    if (e.kind === "stdout" && !humanizeStdoutLine(e.text)) return false;
    return true;
  }).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Activity ({logMode === "human" ? humanVisibleCount : dedupedTranscript.length})
        </span>
        <div className="flex items-center gap-2">
          {/* Human / Raw toggle */}
          <div className="flex items-center rounded-md border border-border text-sm overflow-hidden">
            <button
              className={cn(
                "px-2 py-0.5 transition-colors",
                logMode === "human" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onLogModeChange("human")}
            >
              Summary
            </button>
            <button
              className={cn(
                "px-2 py-0.5 transition-colors border-l border-border",
                logMode === "raw" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onLogModeChange("raw")}
            >
              Full
            </button>
          </div>
          {isLive && (
            <span className="flex items-center gap-1 text-xs text-cyan-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
              </span>
              Live
            </span>
          )}
        </div>
      </div>
      {(() => {
        return (
          <div className="rounded-lg text-sm overflow-x-hidden space-y-2">
            {displayEntries.length === 0 && !run.logRef && (
              <div className="text-neutral-500 bg-neutral-100 dark:bg-neutral-950 rounded-lg p-3">No log available for this run.</div>
            )}
            {logMode === "human" ? (
              /* ---- Human-readable mode ---- */
              displayEntries.map((entry, idx) => {
                const time = new Date(entry.ts).toLocaleTimeString("en-US", { hour12: false });
                const tsEl = <span className="text-sm text-neutral-400 dark:text-neutral-600 select-none shrink-0">{time}</span>;
                const cardBase = "rounded-lg border p-4 [animation:log-entry-in_0.35s_ease-out_both]";

                if (entry.kind === "assistant") {
                  return (
                    <div key={`${entry.ts}-h-${idx}`} className={cn(cardBase, "border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-950/20")}>
                      <div className="flex items-center gap-2 mb-2">
                        {tsEl}
                        <span className="text-sm font-semibold uppercase tracking-wider text-green-700 dark:text-green-300">Agent</span>
                      </div>
                      <MarkdownBody className="text-sm text-green-950 dark:text-green-50">{entry.text}</MarkdownBody>
                    </div>
                  );
                }

                if (entry.kind === "thinking") {
                  return (
                    <div key={`${entry.ts}-h-${idx}`} className={cn(cardBase, "border-green-100 dark:border-green-900/20 bg-green-50/30 dark:bg-green-950/10 opacity-60")}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {tsEl}
                        <span className="text-sm italic font-medium text-green-600/70 dark:text-green-300/60">Thinking</span>
                      </div>
                      <MarkdownBody className="italic text-sm opacity-70">{entry.text}</MarkdownBody>
                    </div>
                  );
                }

                // tool_call — skip in human mode (too technical)
                if (entry.kind === "tool_call") return null;

                if (entry.kind === "tool_result") {
                  if (entry.isError) {
                    return (
                      <div key={`${entry.ts}-h-${idx}`} className={cn(cardBase, "border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20")}>
                        <div className="flex items-center gap-2 mb-2">
                          {tsEl}
                          <span className="text-sm font-semibold uppercase tracking-wider text-red-600 dark:text-red-300">Tool error</span>
                        </div>
                        <pre className="text-red-600 dark:text-red-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto text-sm">
                          {(() => { try { return JSON.stringify(JSON.parse(entry.content), null, 2); } catch { return entry.content; } })()}
                        </pre>
                      </div>
                    );
                  }
                  // Non-error tool results — skip in human mode
                  return null;
                }

                if (entry.kind === "init") {
                  return (
                    <div key={`${entry.ts}-h-${idx}`} className={cn(cardBase, "border-blue-200 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/15")}>
                      <div className="flex items-center gap-2">
                        {tsEl}
                        <span className="text-sm font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Agent started</span>
                      </div>
                    </div>
                  );
                }

                // result — cost already shown in run header, skip in human mode
                if (entry.kind === "result") return null;

                if (entry.kind === "user") {
                  return (
                    <div key={`${entry.ts}-h-${idx}`} className={cn(cardBase, "border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50")}>
                      <div className="flex items-center gap-2 mb-2">
                        {tsEl}
                        <span className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Prompt</span>
                      </div>
                      <MarkdownBody className="text-sm">{entry.text}</MarkdownBody>
                    </div>
                  );
                }

                if (entry.kind === "stderr") {
                  // In summary mode, show only the first meaningful line (strip stack traces)
                  const firstLine = entry.text.split("\n").find((l) => l.trim() && !l.trim().startsWith("at ")) ?? entry.text.split("\n")[0];
                  return (
                    <div key={`${entry.ts}-h-${idx}`} className={cn(cardBase, "border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20")}>
                      <div className="flex items-center gap-2 mb-2">
                        {tsEl}
                        <span className="text-sm font-semibold uppercase tracking-wider text-red-600 dark:text-red-300">Error</span>
                      </div>
                      <div className="text-red-600 dark:text-red-300 break-words text-sm">{firstLine}</div>
                    </div>
                  );
                }

                // system — skip in human mode
                if (entry.kind === "system") return null;

                // stdout — try to extract human-readable content from JSON blobs
                {
                  const rawText = entry.text;
                  const humanText = humanizeStdoutLine(rawText);
                  if (!humanText) return null;
                  return (
                    <div key={`${entry.ts}-h-${idx}`} className={cn(cardBase, "border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950")}>
                      <div className="flex items-center gap-2 mb-1.5">
                        {tsEl}
                      </div>
                      <MarkdownBody className="text-sm">{humanText}</MarkdownBody>
                    </div>
                  );
                }
              })
            ) : (
              /* ---- Raw mode (original) ---- */
              <div className="bg-neutral-100 dark:bg-neutral-950 rounded-lg p-3 space-y-0.5">
              {displayEntries.map((entry, idx) => {
                const time = new Date(entry.ts).toLocaleTimeString("en-US", { hour12: false });
                const grid = "grid grid-cols-[auto_auto_1fr] gap-x-2 sm:gap-x-3 items-baseline";
                const tsCell = "text-neutral-400 dark:text-neutral-600 select-none w-14 sm:w-18 text-xs sm:text-sm";
                const lblCell = "w-16 sm:w-20 text-xs sm:text-sm";
                const contentCell = "min-w-0 whitespace-pre-wrap break-words overflow-hidden";
                const expandCell = "col-span-full md:col-start-3 md:col-span-1";

                if (entry.kind === "assistant") {
                  return (
                    <div key={`${entry.ts}-assistant-${idx}`} className={cn(grid, "py-0.5")}>
                      <span className={tsCell}>{time}</span>
                      <span className={cn(lblCell, "text-green-700 dark:text-green-300")}>assistant</span>
                      <span className={cn(contentCell, "text-green-900 dark:text-green-100")}>{entry.text}</span>
                    </div>
                  );
                }

                if (entry.kind === "thinking") {
                  return (
                    <div key={`${entry.ts}-thinking-${idx}`} className={cn(grid, "py-0.5")}>
                      <span className={tsCell}>{time}</span>
                      <span className={cn(lblCell, "text-green-600/60 dark:text-green-300/60")}>thinking</span>
                      <span className={cn(contentCell, "text-green-800/60 dark:text-green-100/60 italic")}>{entry.text}</span>
                    </div>
                  );
                }

                if (entry.kind === "user") {
                  return (
                    <div key={`${entry.ts}-user-${idx}`} className={cn(grid, "py-0.5")}>
                      <span className={tsCell}>{time}</span>
                      <span className={cn(lblCell, "text-neutral-500 dark:text-neutral-400")}>user</span>
                      <span className={cn(contentCell, "text-neutral-700 dark:text-neutral-300")}>{entry.text}</span>
                    </div>
                  );
                }

                if (entry.kind === "tool_call") {
                  return (
                    <div key={`${entry.ts}-tool-${idx}`} className={cn(grid, "gap-y-1 py-0.5")}>
                      <span className={tsCell}>{time}</span>
                      <span className={cn(lblCell, "text-yellow-700 dark:text-yellow-300")}>tool_call</span>
                      <span className="text-yellow-900 dark:text-yellow-100 min-w-0">{entry.name}</span>
                      <pre className={cn(expandCell, "bg-neutral-200 dark:bg-neutral-900 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap text-neutral-800 dark:text-neutral-200")}>
                        {JSON.stringify(entry.input, null, 2)}
                      </pre>
                    </div>
                  );
                }

                if (entry.kind === "tool_result") {
                  return (
                    <div key={`${entry.ts}-toolres-${idx}`} className={cn(grid, "gap-y-1 py-0.5")}>
                      <span className={tsCell}>{time}</span>
                      <span className={cn(lblCell, entry.isError ? "text-red-600 dark:text-red-300" : "text-purple-600 dark:text-purple-300")}>tool_result</span>
                      {entry.isError ? <span className="text-red-600 dark:text-red-400 min-w-0">error</span> : <span />}
                      <pre className={cn(expandCell, "bg-neutral-100 dark:bg-neutral-900 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap text-neutral-700 dark:text-neutral-300 max-h-60 overflow-y-auto")}>
                        {(() => { try { return JSON.stringify(JSON.parse(entry.content), null, 2); } catch { return entry.content; } })()}
                      </pre>
                    </div>
                  );
                }

                if (entry.kind === "init") {
                  return (
                    <div key={`${entry.ts}-init-${idx}`} className={grid}>
                      <span className={tsCell}>{time}</span>
                      <span className={cn(lblCell, "text-blue-700 dark:text-blue-300")}>init</span>
                      <span className={cn(contentCell, "text-blue-900 dark:text-blue-100")}>model: {entry.model}{entry.sessionId ? `, session: ${entry.sessionId}` : ""}</span>
                    </div>
                  );
                }

                if (entry.kind === "result") {
                  return (
                    <div key={`${entry.ts}-result-${idx}`} className={cn(grid, "gap-y-1 py-0.5")}>
                      <span className={tsCell}>{time}</span>
                      <span className={cn(lblCell, "text-cyan-700 dark:text-cyan-300")}>result</span>
                      <span className={cn(contentCell, "text-cyan-900 dark:text-cyan-100")}>
                        tokens in={formatTokens(entry.inputTokens)} out={formatTokens(entry.outputTokens)} cached={formatTokens(entry.cachedTokens)} cost=${entry.costUsd.toFixed(6)}
                      </span>
                      {(entry.subtype || entry.isError || entry.errors.length > 0) && (
                        <div className={cn(expandCell, "text-red-600 dark:text-red-300 whitespace-pre-wrap break-words")}>
                          subtype={entry.subtype || "unknown"} is_error={entry.isError ? "true" : "false"}
                          {entry.errors.length > 0 ? ` errors=${entry.errors.join(" | ")}` : ""}
                        </div>
                      )}
                      {entry.text && (
                        <div className={cn(expandCell, "whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-100")}>{entry.text}</div>
                      )}
                    </div>
                  );
                }

                const rawText = entry.text;
                const label =
                  entry.kind === "stderr" ? "warning" :
                  entry.kind === "system" ? "system" :
                  "stdout";
                const color =
                  entry.kind === "stderr" ? "text-red-600 dark:text-red-300" :
                  entry.kind === "system" ? "text-blue-600 dark:text-blue-300" :
                  "text-neutral-500";
                return (
                  <div key={`${entry.ts}-raw-${idx}`} className={grid}>
                    <span className={tsCell}>{time}</span>
                    <span className={cn(lblCell, color)}>{label}</span>
                    <span className={cn(contentCell, color)}>{rawText}</span>
                  </div>
                )
              })}
              </div>
            )}
            {logError && <div className="text-red-600 dark:text-red-300 p-3">{logError}</div>}
          </div>
        );
      })()}

      {(run.status === "failed" || run.status === "timed_out") && !run.logRef && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-300">Failure details</div>
          {run.error && (
            <div className="text-xs text-red-600 dark:text-red-300">
              {run.error}
            </div>
          )}
          {run.stderrExcerpt && run.stderrExcerpt.trim() && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-300 mb-1">Warnings</div>
              <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap break-words overflow-x-auto">
                {run.stderrExcerpt}
              </pre>
            </div>
          )}
          {run.resultJson && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-300 mb-1">Result</div>
              <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap break-words overflow-x-auto">
                {JSON.stringify(run.resultJson, null, 2)}
              </pre>
            </div>
          )}
          {run.stdoutExcerpt && run.stdoutExcerpt.trim() && !run.resultJson && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-300 mb-1">Output</div>
              <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap break-words overflow-x-auto">
                {run.stdoutExcerpt}
              </pre>
            </div>
          )}
        </div>
      )}

      {events.length > 0 && logMode === "raw" && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Events ({events.length})</div>
          <div className="bg-neutral-100 dark:bg-neutral-950 rounded-lg p-3 text-xs space-y-0.5">
            {events.map((evt) => {
              const color = evt.color
                ?? (evt.level ? levelColors[evt.level] : null)
                ?? (evt.stream ? streamColors[evt.stream] : null)
                ?? "text-foreground";

              return (
                <div key={evt.id} className="flex gap-2">
                  <span className="text-neutral-400 dark:text-neutral-600 shrink-0 select-none w-16">
                    {new Date(evt.createdAt).toLocaleTimeString("en-US", { hour12: false })}
                  </span>
                  <span className={cn("shrink-0 w-14", evt.stream ? (streamColors[evt.stream] ?? "text-neutral-500") : "text-neutral-500")}>
                    {evt.stream ? `[${evt.stream}]` : ""}
                  </span>
                  <span className={cn("break-all", color)}>
                    {evt.message ?? (evt.payload ? JSON.stringify(evt.payload) : "")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Keys Tab ---- */

function KeysTab({ agentId, companyId }: { agentId: string; companyId?: string }) {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: keys, isLoading } = useQuery({
    queryKey: queryKeys.agents.keys(agentId),
    queryFn: () => agentsApi.listKeys(agentId, companyId),
  });

  const createKey = useMutation({
    mutationFn: () => agentsApi.createKey(agentId, newKeyName.trim() || "Default", companyId),
    onSuccess: (data) => {
      setNewToken(data.token);
      setTokenVisible(true);
      setNewKeyName("");
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.keys(agentId) });
    },
  });

  const revokeKey = useMutation({
    mutationFn: (keyId: string) => agentsApi.revokeKey(agentId, keyId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.keys(agentId) });
    },
  });

  function copyToken() {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const activeKeys = (keys ?? []).filter((k: AgentKey) => !k.revokedAt);
  const revokedKeys = (keys ?? []).filter((k: AgentKey) => k.revokedAt);

  return (
    <div className="space-y-8">
      {/* New token banner */}
      {newToken && (
        <div className="border border-yellow-300 dark:border-yellow-600/40 bg-yellow-50 dark:bg-yellow-500/5 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
            API key created — copy it now, it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-neutral-100 dark:bg-neutral-950 rounded px-3 py-1.5 text-xs font-mono text-green-700 dark:text-green-300 truncate">
              {tokenVisible ? newToken : newToken.replace(/./g, "•")}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTokenVisible((v) => !v)}
              title={tokenVisible ? "Hide" : "Show"}
            >
              {tokenVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={copyToken}
              title="Copy"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {copied && <span className="text-xs text-green-400">Copied!</span>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            onClick={() => setNewToken(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Create new key */}
      <div className="border border-border/50 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          <Key className="h-3.5 w-3.5" />
          Create API Key
        </h3>
        <p className="text-xs text-muted-foreground">
          API keys allow this agent to authenticate calls to the Substaff server.
        </p>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Key name (e.g. production)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") createKey.mutate();
            }}
          />
          <Button
            size="sm"
            onClick={() => createKey.mutate()}
            disabled={createKey.isPending}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Create
          </Button>
        </div>
      </div>

      {/* Active keys */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading keys...</p>}

      {!isLoading && activeKeys.length === 0 && !newToken && (
        <p className="text-sm text-muted-foreground">No active API keys.</p>
      )}

      {activeKeys.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2">
            Active Keys
          </h3>
          <div className="border border-border/50 rounded-xl divide-y divide-border/50">
            {activeKeys.map((key: AgentKey) => (
              <div key={key.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium">{key.name}</span>
                  <span className="text-xs text-muted-foreground ml-3">
                    Created {formatDate(key.createdAt)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive text-xs"
                  onClick={() => revokeKey.mutate(key.id)}
                  disabled={revokeKey.isPending}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-2">
            Revoked Keys
          </h3>
          <div className="border border-border/50 rounded-xl divide-y divide-border/50 opacity-50">
            {revokedKeys.map((key: AgentKey) => (
              <div key={key.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm line-through">{key.name}</span>
                  <span className="text-xs text-muted-foreground ml-3">
                    Revoked {key.revokedAt ? formatDate(key.revokedAt) : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
