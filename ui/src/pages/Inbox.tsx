import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { plansApi, type TaskPlanWithIssue } from "../api/plans";
import { accessApi } from "../api/access";
import { ApiError } from "../api/client";
import { dashboardApi } from "../api/dashboard";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { billingApi } from "../api/billing";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { typeLabel, typeIcon, defaultTypeIcon, ApprovalPayloadRenderer } from "../components/ApprovalPayload";
import { StatusBadge } from "../components/StatusBadge";
import { timeAgo } from "../lib/timeAgo";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Inbox as InboxIcon,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  XCircle,
  UserCheck,
  RotateCcw,
  FileText,
  Check,
  X,
} from "lucide-react";
import { Identity } from "../components/Identity";
import { MarkdownBody } from "../components/MarkdownBody";
import { PageTabBar } from "../components/PageTabBar";
import { InputDialog } from "../components/InputDialog";
import type { HeartbeatRun, Issue, JoinRequest } from "@substaff/shared";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const FAILED_RUN_STATUSES = new Set(["failed", "timed_out"]);
const ACTIONABLE_APPROVAL_STATUSES = new Set(["pending", "revision_requested"]);

type InboxTab = "new" | "all";
type InboxCategoryFilter =
  | "everything"
  | "assigned_to_me"
  | "blocked"
  | "join_requests"
  | "approvals"
  | "pending_plans"
  | "failed_runs"
  | "alerts"
  | "stale_work";
type InboxApprovalFilter = "all" | "actionable" | "resolved";
type SectionKey =
  | "assigned_to_me"
  | "blocked"
  | "join_requests"
  | "approvals"
  | "pending_plans"
  | "failed_runs"
  | "alerts"
  | "stale_work";

const RUN_SOURCE_LABELS: Record<string, string> = {
  timer: "Scheduled",
  assignment: "Assignment",
  on_demand: "Manual",
  automation: "Automation",
};

function getStaleIssues(issues: Issue[]): Issue[] {
  const now = Date.now();
  return issues
    .filter(
      (i) =>
        ["in_progress", "todo"].includes(i.status) &&
        now - new Date(i.updatedAt).getTime() > STALE_THRESHOLD_MS,
    )
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
}

function getLatestFailedRunsByAgent(runs: HeartbeatRun[]): HeartbeatRun[] {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latestByAgent = new Map<string, HeartbeatRun>();

  for (const run of sorted) {
    if (!latestByAgent.has(run.agentId)) {
      latestByAgent.set(run.agentId, run);
    }
  }

  return Array.from(latestByAgent.values()).filter((run) => FAILED_RUN_STATUSES.has(run.status));
}

function summarizeErrorText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Try to extract a JSON object and pull out human-readable fields
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart));
      const prefix = trimmed.slice(0, jsonStart).trim();
      const parts: string[] = [];
      if (prefix) parts.push(prefix);
      if (parsed.message) parts.push(parsed.message);
      else if (parsed.error) parts.push(typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error));
      if (parsed.code) parts.push(`(${parsed.code})`);
      if (parsed.details) {
        const d = parsed.details;
        const detailStr = typeof d === "string" ? d : Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(", ");
        parts.push(`— ${detailStr}`);
      }
      if (parts.length > 0) return parts.join(" ");
    } catch {
      // not valid JSON
    }
  }
  // Fallback: first non-empty line (skip stack traces)
  const line = trimmed.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("at "));
  return line ?? trimmed.split("\n")[0] ?? trimmed;
}

function runFailureMessage(run: HeartbeatRun): string {
  if (run.error) return summarizeErrorText(run.error);
  if (run.stderrExcerpt) return summarizeErrorText(run.stderrExcerpt);
  return "Run exited with an error.";
}

function readIssueIdFromRun(run: HeartbeatRun): string | null {
  const context = run.contextSnapshot;
  if (!context) return null;

  const issueId = context["issueId"];
  if (typeof issueId === "string" && issueId.length > 0) return issueId;

  const taskId = context["taskId"];
  if (typeof taskId === "string" && taskId.length > 0) return taskId;

  return null;
}

function FailedRunCard({
  run,
  issueById,
  agentName: linkedAgentName,
}: {
  run: HeartbeatRun;
  issueById: Map<string, Issue>;
  agentName: string | null;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const issueId = readIssueIdFromRun(run);
  const issue = issueId ? issueById.get(issueId) ?? null : null;
  const sourceLabel = RUN_SOURCE_LABELS[run.invocationSource] ?? "Manual";
  const displayError = runFailureMessage(run);

  const retryRun = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      const context = run.contextSnapshot as Record<string, unknown> | null;
      if (context) {
        if (typeof context.issueId === "string" && context.issueId) payload.issueId = context.issueId;
        if (typeof context.taskId === "string" && context.taskId) payload.taskId = context.taskId;
        if (typeof context.taskKey === "string" && context.taskKey) payload.taskKey = context.taskKey;
      }
      const result = await agentsApi.wakeup(run.agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "retry_failed_run",
        payload,
      });
      if (!("id" in result)) {
        throw new Error("Retry was skipped because the agent is not currently invokable.");
      }
      return result;
    },
    onSuccess: (newRun) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(run.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(run.companyId, run.agentId) });
      navigate(`/agents/${run.agentId}/runs/${newRun.id}`);
    },
  });

  return (
    <div className="group relative overflow-hidden rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/10 via-card to-card p-4">
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-red-500/10 blur-2xl" />
      <div className="relative space-y-3">
        {issue ? (
          <Link
            to={`/issues/${issue.identifier ?? issue.id}`}
            className="block truncate text-sm font-medium transition-colors hover:text-foreground no-underline text-inherit"
          >
            <span className="font-mono text-muted-foreground mr-1.5">
              {issue.identifier ?? issue.id.slice(0, 8)}
            </span>
            {issue.title}
          </Link>
        ) : (
          <span className="block text-sm text-muted-foreground">
            {run.errorCode ? `Error code: ${run.errorCode}` : "No linked issue"}
          </span>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-red-500/20 p-1.5">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </span>
              {linkedAgentName ? (
                <Identity name={linkedAgentName} size="sm" />
              ) : (
                <span className="text-sm font-medium">{run.agentId.slice(0, 8)}</span>
              )}
              <StatusBadge status={run.status} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {sourceLabel} run failed {timeAgo(run.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5"
              onClick={() => retryRun.mutate()}
              disabled={retryRun.isPending}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {retryRun.isPending ? "Retrying…" : "Retry"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5"
              asChild
            >
              <Link to={`/agents/${run.agentId}/runs/${run.id}`}>
                Open run
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm">
          {displayError}
        </div>

        <div className="text-xs">
          <span className="font-mono text-muted-foreground">run {run.id.slice(0, 8)}</span>
        </div>

        {retryRun.isError && (
          <div className="text-xs text-destructive">
            {retryRun.error instanceof Error ? retryRun.error.message : "Failed to retry run"}
          </div>
        )}
      </div>
    </div>
  );
}

export function Inbox() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [allCategoryFilter, setAllCategoryFilter] = useState<InboxCategoryFilter>("everything");
  const [allApprovalFilter, setAllApprovalFilter] = useState<InboxApprovalFilter>("all");
  const [rejectPlanTarget, setRejectPlanTarget] = useState<TaskPlanWithIssue | null>(null);
  const [reviewPlan, setReviewPlan] = useState<TaskPlanWithIssue | null>(null);
  const [reviewApproval, setReviewApproval] = useState<(typeof allApprovals)[number] | null>(null);

  const pathSegment = location.pathname.split("/").pop() ?? "new";
  const tab: InboxTab = pathSegment === "all" ? "all" : "new";

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "My Work" }]);
  }, [setBreadcrumbs]);

  const {
    data: approvals,
    isLoading: isApprovalsLoading,
    error: approvalsError,
  } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: joinRequests = [],
    isLoading: isJoinRequestsLoading,
  } = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId!),
    queryFn: async () => {
      try {
        return await accessApi.listJoinRequests(selectedCompanyId!, "pending_approval");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          return [];
        }
        throw err;
      }
    },
    enabled: !!selectedCompanyId,
    retry: false,
  });

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: billingInfo } = useQuery({
    queryKey: queryKeys.billing.me,
    queryFn: () => billingApi.getMyBilling(),
  });
  const creditsDepleted = (billingInfo?.creditBalanceCents ?? 1) <= 0;

  const { data: issues, isLoading: isIssuesLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const {
    data: assignedToMeIssuesRaw = [],
    isLoading: isAssignedToMeLoading,
  } = useQuery({
    queryKey: queryKeys.issues.listAssignedToMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        assigneeUserId: "me",
        status: "backlog,todo,in_progress,in_review,blocked",
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: blockedIssuesRaw = [] } = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "blocked"] as const,
    queryFn: () => issuesApi.list(selectedCompanyId!, { status: "blocked" }),
    enabled: !!selectedCompanyId,
  });
  const blockedIssues = useMemo(
    () =>
      [...blockedIssuesRaw].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [blockedIssuesRaw],
  );

  const { data: heartbeatRuns, isLoading: isRunsLoading } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: pendingPlans = [], isLoading: isPlansLoading } = useQuery({
    queryKey: queryKeys.plans.listByCompany(selectedCompanyId!, "pending_review"),
    queryFn: () => plansApi.listByCompany(selectedCompanyId!, "pending_review"),
    enabled: !!selectedCompanyId,
  });

  const staleIssues = issues ? getStaleIssues(issues) : [];
  const assignedToMeIssues = useMemo(
    () =>
      [...assignedToMeIssuesRaw].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [assignedToMeIssuesRaw],
  );

  const agentById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents ?? []) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) map.set(issue.id, issue);
    return map;
  }, [issues]);

  const failedRuns = useMemo(
    () => getLatestFailedRunsByAgent(heartbeatRuns ?? []),
    [heartbeatRuns],
  );

  const allApprovals = useMemo(
    () =>
      [...(approvals ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [approvals],
  );

  const actionableApprovals = useMemo(
    () => allApprovals.filter((approval) => ACTIONABLE_APPROVAL_STATUSES.has(approval.status)),
    [allApprovals],
  );

  const filteredAllApprovals = useMemo(() => {
    if (allApprovalFilter === "all") return allApprovals;

    return allApprovals.filter((approval) => {
      const isActionable = ACTIONABLE_APPROVAL_STATUSES.has(approval.status);
      return allApprovalFilter === "actionable" ? isActionable : !isActionable;
    });
  }, [allApprovals, allApprovalFilter]);

  const agentName = (id: string | null) => {
    if (!id) return null;
    return agentById.get(id) ?? null;
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (_approval, id) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject");
    },
  });

  const approveJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) =>
      accessApi.approveJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve join request");
    },
  });

  const rejectJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) =>
      accessApi.rejectJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject join request");
    },
  });

  const approvePlanMutation = useMutation({
    mutationFn: (plan: TaskPlanWithIssue) =>
      plansApi.approve(selectedCompanyId!, plan.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.listByCompany(selectedCompanyId!, "pending_review") });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve plan");
    },
  });

  const rejectPlanMutation = useMutation({
    mutationFn: ({ plan, comments }: { plan: TaskPlanWithIssue; comments?: string }) =>
      plansApi.reject(selectedCompanyId!, plan.id, comments),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.listByCompany(selectedCompanyId!, "pending_review") });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject plan");
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={InboxIcon} message="Select a workspace to see your work." />;
  }

  const hasRunFailures = failedRuns.length > 0;
  const showAggregateAgentError = !!dashboard && dashboard.agents.error > 0 && !hasRunFailures;
  const showBudgetAlert =
    !!dashboard &&
    dashboard.costs.monthBudgetCents > 0 &&
    dashboard.costs.monthUtilizationPercent >= 80;
  const hasAlerts = showAggregateAgentError || showBudgetAlert || creditsDepleted;
  const hasBlocked = blockedIssues.length > 0;
  const hasStale = staleIssues.length > 0;
  const hasJoinRequests = joinRequests.length > 0;
  const hasAssignedToMe = assignedToMeIssues.length > 0;
  const hasPendingPlans = pendingPlans.length > 0;

  const newItemCount =
    assignedToMeIssues.length +
    blockedIssues.length +
    joinRequests.length +
    actionableApprovals.length +
    pendingPlans.length +
    failedRuns.length +
    staleIssues.length +
    (showAggregateAgentError ? 1 : 0) +
    (showBudgetAlert ? 1 : 0) +
    (creditsDepleted ? 1 : 0);

  const showJoinRequestsCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "join_requests";
  const showAssignedCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "assigned_to_me";
  const showApprovalsCategory = allCategoryFilter === "everything" || allCategoryFilter === "approvals";
  const showPendingPlansCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "pending_plans";
  const showBlockedCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "blocked";
  const showFailedRunsCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "failed_runs";
  const showAlertsCategory = allCategoryFilter === "everything" || allCategoryFilter === "alerts";
  const showStaleCategory = allCategoryFilter === "everything" || allCategoryFilter === "stale_work";

  const approvalsToRender = tab === "new" ? actionableApprovals : filteredAllApprovals;
  const showAssignedSection = tab === "new" ? hasAssignedToMe : showAssignedCategory && hasAssignedToMe;
  const showJoinRequestsSection =
    tab === "new" ? hasJoinRequests : showJoinRequestsCategory && hasJoinRequests;
  const showApprovalsSection =
    tab === "new"
      ? actionableApprovals.length > 0
      : showApprovalsCategory && filteredAllApprovals.length > 0;
  const showPendingPlansSection =
    tab === "new" ? hasPendingPlans : showPendingPlansCategory && hasPendingPlans;
  const showBlockedSection =
    tab === "new" ? hasBlocked : showBlockedCategory && hasBlocked;
  const showFailedRunsSection =
    tab === "new" ? hasRunFailures : showFailedRunsCategory && hasRunFailures;
  const showAlertsSection = tab === "new" ? hasAlerts : showAlertsCategory && hasAlerts;
  const showStaleSection = tab === "new" ? hasStale : showStaleCategory && hasStale;

  const visibleSections = [
    showAssignedSection ? "assigned_to_me" : null,
    showBlockedSection ? "blocked" : null,
    showApprovalsSection ? "approvals" : null,
    showPendingPlansSection ? "pending_plans" : null,
    showJoinRequestsSection ? "join_requests" : null,
    showFailedRunsSection ? "failed_runs" : null,
    showAlertsSection ? "alerts" : null,
    showStaleSection ? "stale_work" : null,
  ].filter((key): key is SectionKey => key !== null);

  const allLoaded =
    !isJoinRequestsLoading &&
    !isApprovalsLoading &&
    !isDashboardLoading &&
    !isIssuesLoading &&
    !isAssignedToMeLoading &&
    !isRunsLoading &&
    !isPlansLoading;


  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Work</h1>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {allLoaded && newItemCount === 0
              ? "You're all caught up. Nothing needs your attention right now."
              : allLoaded
                ? <><span className="text-foreground font-medium">{newItemCount} {newItemCount === 1 ? "item" : "items"}</span> need your attention</>
                : "Loading your workspace..."
            }
          </p>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onValueChange={(value) => navigate(`/inbox/${value === "all" ? "all" : "new"}`)}>
          <PageTabBar
            items={[
              {
                value: "new",
                label: (
                  <>
                    Action needed
                    {newItemCount > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {newItemCount}
                      </span>
                    )}
                  </>
                ),
              },
              { value: "all", label: "Everything" },
            ]}
          />
        </Tabs>

        {tab === "all" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={allCategoryFilter}
              onValueChange={(value) => setAllCategoryFilter(value as InboxCategoryFilter)}
            >
              <SelectTrigger className="h-7 w-auto gap-1.5 rounded-full border-border/60 bg-muted/40 px-3 text-xs font-medium">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everything">All categories</SelectItem>
                <SelectItem value="assigned_to_me">My tasks</SelectItem>
                <SelectItem value="blocked">Blocked tasks</SelectItem>
                <SelectItem value="join_requests">Join requests</SelectItem>
                <SelectItem value="approvals">Reviews</SelectItem>
                <SelectItem value="pending_plans">Plans to review</SelectItem>
                <SelectItem value="failed_runs">Errors</SelectItem>
                <SelectItem value="alerts">Alerts</SelectItem>
                <SelectItem value="stale_work">Needs attention</SelectItem>
              </SelectContent>
            </Select>

            {showApprovalsCategory && (
              <Select
                value={allApprovalFilter}
                onValueChange={(value) => setAllApprovalFilter(value as InboxApprovalFilter)}
              >
                <SelectTrigger className="h-7 w-auto gap-1.5 rounded-full border-border/60 bg-muted/40 px-3 text-xs font-medium">
                  <SelectValue placeholder="Review status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All review statuses</SelectItem>
                  <SelectItem value="actionable">Needs action</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {approvalsError && <p className="text-sm text-destructive">{approvalsError.message}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {!allLoaded && visibleSections.length === 0 && (
        <PageSkeleton variant="inbox" />
      )}

      {allLoaded && visibleSections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="rounded-2xl bg-emerald-500/10 p-4 mb-4">
            <Check className="h-8 w-8 text-emerald-500" />
          </div>
          <p className="text-lg font-semibold mb-1">You're all caught up</p>
          <p className="text-sm text-muted-foreground max-w-[300px]">
            {tab === "new" ? "Nothing needs your attention right now. Your team is running smoothly." : "No items match these filters."}
          </p>
        </div>
      )}

      {/* Alerts — shown at top for urgency */}
      {showAlertsSection && (
        <div className="space-y-2">
          {creditsDepleted && (
            <Link
              to="/billing"
              className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 hover:bg-red-500/10 transition-colors no-underline text-inherit"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Credits depleted</p>
                <p className="text-xs text-muted-foreground">Agents are blocked. Top up your balance to continue.</p>
              </div>
              <span className="text-xs font-medium text-red-500 shrink-0">Top up &rarr;</span>
            </Link>
          )}
          {showAggregateAgentError && (
            <Link
              to="/agents"
              className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 hover:bg-red-500/10 transition-colors no-underline text-inherit"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{dashboard!.agents.error} {dashboard!.agents.error === 1 ? "team member" : "team members"} with errors</p>
                <p className="text-xs text-muted-foreground">Check your team page to investigate and resolve.</p>
              </div>
              <span className="text-xs font-medium text-primary shrink-0">View &rarr;</span>
            </Link>
          )}
          {showBudgetAlert && (
            <Link
              to="/billing"
              className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 hover:bg-amber-500/10 transition-colors no-underline text-inherit"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Budget at {dashboard!.costs.monthUtilizationPercent}%</p>
                <p className="text-xs text-muted-foreground">Monthly spend is approaching your configured limit.</p>
              </div>
              <span className="text-xs font-medium text-primary shrink-0">Review &rarr;</span>
            </Link>
          )}
        </div>
      )}

      {/* Blocked Tasks */}
      {showBlockedSection && (
        <InboxSection
          title="Blocked Tasks"
          count={blockedIssues.length}
          countTone="danger"
          icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
        >
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs">
            {blockedIssues.map((issue) => (
              <Link
                key={issue.id}
                to={`/issues/${issue.identifier ?? issue.id}`}
                className="group flex items-center gap-3 px-4 h-11 hover:bg-accent/40 transition-colors no-underline text-inherit"
              >
                <StatusIcon status="blocked" />
                <PriorityIcon priority={issue.priority} />
                <span className="text-xs font-mono text-muted-foreground">
                  {issue.identifier ?? issue.id.slice(0, 8)}
                </span>
                <span className="flex-1 truncate text-sm">{issue.title}</span>
                {issue.assigneeAgentId && (
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {agentById.get(issue.assigneeAgentId) ?? issue.assigneeAgentId.slice(0, 8)}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(issue.updatedAt)}
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 h-7 text-xs font-medium hover:bg-primary/20 transition-colors">
                  <ArrowUpRight className="h-3 w-3" />
                  View
                </span>
              </Link>
            ))}
          </div>
        </InboxSection>
      )}

      {/* Plans To Review */}
      {showPendingPlansSection && (
        <InboxSection
          title="Plans To Review"
          count={pendingPlans.length}
          icon={<FileText className="h-3.5 w-3.5 text-blue-500" />}
        >
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs">
            {pendingPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setReviewPlan(plan)}
                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/40 transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {plan.issueIdentifier ?? plan.issueId.slice(0, 8)}
                    </span>
                    <span className="text-sm font-medium truncate">{plan.issueTitle}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    {plan.agentId && (
                      <Identity name={agentName(plan.agentId) ?? plan.agentId.slice(0, 8)} size="sm" />
                    )}
                    <span>{timeAgo(plan.createdAt)}</span>
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 h-7 text-xs font-medium hover:bg-primary/20 transition-colors" onClick={(e) => { e.stopPropagation(); setReviewPlan(plan); }}>
                  <FileText className="h-3 w-3" />
                  Review
                </span>
              </button>
            ))}
          </div>
        </InboxSection>
      )}

      {/* Reviews / Approvals */}
      {showApprovalsSection && (
        <InboxSection
          title={tab === "new" ? "Reviews Needing Action" : "Reviews"}
          count={approvalsToRender.length}
          icon={<Check className="h-3.5 w-3.5 text-primary" />}
        >
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs">
            {approvalsToRender.map((approval) => {
              const Icon = typeIcon[approval.type] ?? defaultTypeIcon;
              const label = typeLabel[approval.type] ?? approval.type;
              const requesterName = approval.requestedByAgentId ? agentById.get(approval.requestedByAgentId) : null;
              const isActionable = ACTIONABLE_APPROVAL_STATUSES.has(approval.status);
              return (
                <button
                  key={approval.id}
                  type="button"
                  onClick={() => setReviewApproval(approval)}
                  className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/40 transition-colors"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{label}</span>
                      {!isActionable && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{approval.status}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {requesterName && <Identity name={requesterName} size="sm" />}
                      <span>{timeAgo(approval.createdAt)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 h-7 text-xs font-medium hover:bg-primary/20 transition-colors">
                    <ArrowUpRight className="h-3 w-3" />
                    {isActionable ? "Review" : "View"}
                  </span>
                </button>
              );
            })}
          </div>
        </InboxSection>
      )}

      {/* My Tasks */}
      {showAssignedSection && (
        <InboxSection
          title="My Tasks"
          count={assignedToMeIssues.length}
          icon={<UserCheck className="h-3.5 w-3.5 text-blue-500" />}
        >
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs">
            {assignedToMeIssues.map((issue) => (
              <Link
                key={issue.id}
                to={`/issues/${issue.identifier ?? issue.id}`}
                className="group flex items-center gap-3 px-4 h-11 hover:bg-accent/40 transition-colors no-underline text-inherit"
              >
                <PriorityIcon priority={issue.priority} />
                <StatusIcon status={issue.status} />
                <span className="text-xs font-mono text-muted-foreground">
                  {issue.identifier ?? issue.id.slice(0, 8)}
                </span>
                <span className="flex-1 truncate text-sm">{issue.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(issue.updatedAt)}
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 h-7 text-xs font-medium hover:bg-primary/20 transition-colors">
                  <ArrowUpRight className="h-3 w-3" />
                  View
                </span>
              </Link>
            ))}
          </div>
        </InboxSection>
      )}

      {/* Join Requests */}
      {showJoinRequestsSection && (
        <InboxSection
          title="Join Requests"
          count={joinRequests.length}
          icon={<UserCheck className="h-3.5 w-3.5 text-primary" />}
        >
          <div className="space-y-3">
            {joinRequests.map((joinRequest) => (
              <div key={joinRequest.id} className="rounded-xl border border-border/60 bg-card shadow-xs p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {joinRequest.requestType === "human"
                        ? (joinRequest.requestNameSnapshot || joinRequest.requestEmailSnapshot || "Someone")
                          + " wants to join"
                        : `New agent request${joinRequest.agentName ? `: ${joinRequest.agentName}` : ""}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested {timeAgo(joinRequest.createdAt)}
                      {joinRequest.requestEmailSnapshot &&
                        joinRequest.requestEmailSnapshot !== "local@substaff.local"
                        ? ` · ${joinRequest.requestEmailSnapshot}`
                        : ""}
                    </p>
                    {joinRequest.adapterType && (
                      <p className="text-xs text-muted-foreground">Runtime: {joinRequest.adapterType}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={approveJoinMutation.isPending || rejectJoinMutation.isPending}
                      onClick={() => rejectJoinMutation.mutate(joinRequest)}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={approveJoinMutation.isPending || rejectJoinMutation.isPending}
                      onClick={() => approveJoinMutation.mutate(joinRequest)}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </InboxSection>
      )}

      {/* Failed Runs / Errors */}
      {showFailedRunsSection && (
        <InboxSection
          title="Errors"
          count={failedRuns.length}
          countTone="danger"
          icon={<XCircle className="h-3.5 w-3.5 text-red-500" />}
        >
          <div className="grid gap-3">
            {failedRuns.map((run) => (
              <FailedRunCard
                key={run.id}
                run={run}
                issueById={issueById}
                agentName={agentName(run.agentId)}
              />
            ))}
          </div>
        </InboxSection>
      )}

      {/* Stale / Needs Attention */}
      {showStaleSection && (
        <InboxSection
          title="Needs Attention"
          count={staleIssues.length}
          icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
        >
          <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs">
            {staleIssues.map((issue) => (
              <Link
                key={issue.id}
                to={`/issues/${issue.identifier ?? issue.id}`}
                className="group flex items-center gap-3 px-4 h-11 hover:bg-accent/40 transition-colors no-underline text-inherit"
              >
                <PriorityIcon priority={issue.priority} />
                <StatusIcon status={issue.status} />
                <span className="text-xs font-mono text-muted-foreground">
                  {issue.identifier ?? issue.id.slice(0, 8)}
                </span>
                <span className="flex-1 truncate text-sm">{issue.title}</span>
                {issue.assigneeAgentId &&
                  (() => {
                    const name = agentName(issue.assigneeAgentId);
                    return name ? (
                      <Identity name={name} size="sm" />
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        {issue.assigneeAgentId.slice(0, 8)}
                      </span>
                    );
                  })()}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(issue.updatedAt)}
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 h-7 text-xs font-medium hover:bg-primary/20 transition-colors">
                  <ArrowUpRight className="h-3 w-3" />
                  View
                </span>
              </Link>
            ))}
          </div>
        </InboxSection>
      )}

      {/* Approval review dialog */}
      <Dialog open={!!reviewApproval} onOpenChange={(open) => { if (!open) setReviewApproval(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          {reviewApproval && (() => {
            const Icon = typeIcon[reviewApproval.type] ?? defaultTypeIcon;
            const label = typeLabel[reviewApproval.type] ?? reviewApproval.type;
            const requesterName = reviewApproval.requestedByAgentId ? agentById.get(reviewApproval.requestedByAgentId) : null;
            const isActionable = ACTIONABLE_APPROVAL_STATUSES.has(reviewApproval.status);
            return (
              <>
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {requesterName && (
                      <>
                        <span className="text-xs text-muted-foreground">requested by</span>
                        <Identity name={requesterName} size="sm" />
                      </>
                    )}
                    <span className="text-border">&middot;</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(reviewApproval.createdAt)}</span>
                  </div>
                  <DialogTitle className="text-base">{label}</DialogTitle>
                  <DialogDescription className="sr-only">Review the approval request details.</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <ApprovalPayloadRenderer type={reviewApproval.type} payload={reviewApproval.payload} />
                  {reviewApproval.decisionNote && (
                    <div className="mt-4 text-xs text-muted-foreground italic border-t border-border/50 pt-3">
                      Note: {reviewApproval.decisionNote}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border/50 bg-muted/30 shrink-0">
                  <Link
                    to={`/approvals/${reviewApproval.id}`}
                    className="text-xs text-primary hover:text-primary/80 transition-colors no-underline"
                    onClick={() => setReviewApproval(null)}
                  >
                    View details &rarr;
                  </Link>
                  {isActionable ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                        onClick={() => {
                          rejectMutation.mutate(reviewApproval.id);
                          setReviewApproval(null);
                        }}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                        onClick={() => {
                          approveMutation.mutate(reviewApproval.id);
                          setReviewApproval(null);
                        }}
                      >
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        Approve
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{reviewApproval.status}</span>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Plan review dialog */}
      <Dialog open={!!reviewPlan} onOpenChange={(open) => { if (!open) setReviewPlan(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          {reviewPlan && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">
                    {reviewPlan.issueIdentifier ?? reviewPlan.issueId.slice(0, 8)}
                  </span>
                  {reviewPlan.agentId && (
                    <>
                      <span className="text-border">&middot;</span>
                      <Identity name={agentName(reviewPlan.agentId) ?? reviewPlan.agentId.slice(0, 8)} size="sm" />
                    </>
                  )}
                  <span className="text-border">&middot;</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(reviewPlan.createdAt)}</span>
                </div>
                <DialogTitle className="text-base">{reviewPlan.issueTitle}</DialogTitle>
                <DialogDescription className="sr-only">Review the proposed plan and approve or reject it.</DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-5 text-sm">
                <MarkdownBody>{reviewPlan.planMarkdown}</MarkdownBody>
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border/50 bg-muted/30 shrink-0">
                <Link
                  to={`/issues/${reviewPlan.issueIdentifier ?? reviewPlan.issueId}`}
                  className="text-xs text-primary hover:text-primary/80 transition-colors no-underline"
                >
                  View task &rarr;
                </Link>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={approvePlanMutation.isPending || rejectPlanMutation.isPending}
                    onClick={() => {
                      setReviewPlan(null);
                      setTimeout(() => setRejectPlanTarget(reviewPlan), 200);
                    }}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={approvePlanMutation.isPending || rejectPlanMutation.isPending}
                    onClick={() => {
                      approvePlanMutation.mutate(reviewPlan);
                      setReviewPlan(null);
                    }}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    Approve
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <InputDialog
        open={!!rejectPlanTarget}
        onOpenChange={(open) => { if (!open) setRejectPlanTarget(null); }}
        title="Reject plan"
        description="Provide an optional reason for rejecting this plan."
        placeholder="Rejection reason (optional)"
        multiline
        confirmLabel="Reject"
        onConfirm={(comments) => {
          if (rejectPlanTarget) {
            rejectPlanMutation.mutate({ plan: rejectPlanTarget, comments: comments || undefined });
          }
          setRejectPlanTarget(null);
        }}
      />
    </div>
  );
}

function InboxSection({
  title,
  count,
  countTone,
  icon,
  children,
}: {
  title: string;
  count?: number;
  countTone?: "danger" | "default";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon && (
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 shrink-0">
            {icon}
          </div>
        )}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {count !== undefined && count > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            countTone === "danger"
              ? "bg-red-500/15 text-red-500"
              : "bg-muted text-muted-foreground"
          }`}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
