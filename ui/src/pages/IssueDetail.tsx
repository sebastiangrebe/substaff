import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { plansApi } from "../api/plans";
import { activityApi } from "../api/activity";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useToast } from "../context/ToastContext";
import { usePanel } from "../context/PanelContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { relativeTime, cn, formatTokens } from "../lib/utils";
import { live } from "../lib/status-colors";
import { InlineEditor } from "../components/InlineEditor";
import { EntityAttachments } from "../components/EntityAttachments";
import { CommentThread } from "../components/CommentThread";
import { IssueProperties } from "../components/IssueProperties";
import { LiveRunWidget } from "../components/LiveRunWidget";
import type { MentionOption } from "../components/MarkdownEditor";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusBadge } from "../components/StatusBadge";
import { MarkdownBody } from "../components/MarkdownBody";
import { Identity } from "../components/Identity";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity as ActivityIcon,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  EyeOff,
  FileText,
  Hexagon,
  Link2,
  ListTree,
  MessageSquare,
  MoreHorizontal,

  Plus,

  X,
} from "lucide-react";
import type { ActivityEvent, TaskPlan } from "@substaff/shared";
import type { Agent } from "@substaff/shared";
import { formatActivityVerb, humanizeActorName } from "../lib/activity-labels";

type CommentReassignment = {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function usageNumber(usage: Record<string, unknown> | null, ...keys: string[]) {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

function ActorIdentity({ evt, agentMap }: { evt: ActivityEvent; agentMap: Map<string, Agent> }) {
  const id = evt.actorId;
  if (evt.actorType === "agent") {
    const agent = agentMap.get(id);
    return <Identity name={agent?.name ?? id.slice(0, 8)} size="sm" />;
  }
  return <Identity name={humanizeActorName(evt.actorType, id || null)} size="sm" />;
}

function DependencyAdder({
  currentIssueId,
  existingDepIds,
  issues,
  onAdd,
}: {
  currentIssueId: string;
  existingDepIds: Set<string>;
  issues: { id: string; identifier: string | null; title: string }[];
  onAdd: (issueId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = issues.filter(
    (i) =>
      !existingDepIds.has(i.id) &&
      i.id !== currentIssueId &&
      (i.title.toLowerCase().includes(search.toLowerCase()) ||
        (i.identifier ?? "").toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground h-7">
          <Link2 className="h-3 w-3" />
          Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <input
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring mb-2"
          placeholder="Search issues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No matching issues</p>
          ) : (
            filtered.slice(0, 20).map((i) => (
              <Button
                key={i.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs gap-1.5"
                onClick={() => {
                  onAdd(i.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="font-mono text-muted-foreground shrink-0">
                  {i.identifier ?? i.id.slice(0, 8)}
                </span>
                <span className="truncate">{i.title}</span>
              </Button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function IssueDetail() {
  const { issueId } = useParams<{ issueId: string }>();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();
  const { pushToast } = useToast();
  const { closePanel } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState({
    approvals: false,
    cost: false,
    activity: false,
  });

  const { data: issue, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.detail(issueId!),
    queryFn: () => issuesApi.get(issueId!),
    enabled: !!issueId,
  });

  const { data: comments } = useQuery({
    queryKey: queryKeys.issues.comments(issueId!),
    queryFn: () => issuesApi.listComments(issueId!),
    enabled: !!issueId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.issues.activity(issueId!),
    queryFn: () => activityApi.forIssue(issueId!),
    enabled: !!issueId,
  });

  const { data: linkedRuns } = useQuery({
    queryKey: queryKeys.issues.runs(issueId!),
    queryFn: () => activityApi.runsForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 5000,
  });

  const { data: linkedApprovals } = useQuery({
    queryKey: queryKeys.issues.approvals(issueId!),
    queryFn: () => issuesApi.listApprovals(issueId!),
    enabled: !!issueId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(issueId!),
    queryFn: () => heartbeatsApi.liveRunsForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 3000,
  });

  const { data: activeRun } = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId!),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId!),
    enabled: !!issueId,
    refetchInterval: 3000,
  });

  const { data: plans } = useQuery({
    queryKey: queryKeys.issues.plans(issueId!),
    queryFn: () => plansApi.list(selectedCompanyId!, issueId!),
    enabled: !!issueId && !!selectedCompanyId,
  });

  const { data: dependencies } = useQuery({
    queryKey: queryKeys.issues.dependencies(issueId!),
    queryFn: () => issuesApi.listDependencies(issueId!),
    enabled: !!issueId,
  });

  const hasLiveRuns = (liveRuns ?? []).length > 0 || !!activeRun;

  // Filter out runs already shown by the live widget to avoid duplication
  const timelineRuns = useMemo(() => {
    const liveIds = new Set<string>();
    for (const r of liveRuns ?? []) liveIds.add(r.id);
    if (activeRun) liveIds.add(activeRun.id);
    if (liveIds.size === 0) return linkedRuns ?? [];
    return (linkedRuns ?? []).filter((r) => !liveIds.has(r.runId));
  }, [linkedRuns, liveRuns, activeRun]);

  const { data: allIssues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const { orderedProjects } = useProjectOrder({
    projects: projects ?? [],
    companyId: selectedCompanyId,
    userId: currentUserId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const options: MentionOption[] = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({
        id: `agent:${agent.id}`,
        name: agent.name,
        kind: "agent",
      });
    }
    for (const project of orderedProjects) {
      options.push({
        id: `project:${project.id}`,
        name: project.name,
        kind: "project",
        projectId: project.id,
        projectColor: project.color,
      });
    }
    return options;
  }, [agents, orderedProjects]);

  const childIssues = useMemo(() => {
    if (!allIssues || !issue) return [];
    return allIssues
      .filter((i) => i.parentId === issue.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [allIssues, issue]);

  const commentReassignOptions = useMemo(() => {
    const options: Array<{ id: string; label: string; searchText?: string }> = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({ id: `agent:${agent.id}`, label: agent.name });
    }
    if (currentUserId) {
      const label = currentUserId === "local-board" ? "Board" : "Me (Board)";
      options.push({ id: `user:${currentUserId}`, label });
    }
    return options;
  }, [agents, currentUserId]);

  const currentAssigneeValue = useMemo(() => {
    if (issue?.assigneeAgentId) return `agent:${issue.assigneeAgentId}`;
    if (issue?.assigneeUserId) return `user:${issue.assigneeUserId}`;
    return "";
  }, [issue?.assigneeAgentId, issue?.assigneeUserId]);

  const commentsWithRunMeta = useMemo(() => {
    const runMetaByCommentId = new Map<string, { runId: string; runAgentId: string | null }>();
    const agentIdByRunId = new Map<string, string>();
    for (const run of linkedRuns ?? []) {
      agentIdByRunId.set(run.runId, run.agentId);
    }
    for (const evt of activity ?? []) {
      if (evt.action !== "issue.comment_added" || !evt.runId) continue;
      const details = evt.details ?? {};
      const commentId = typeof details["commentId"] === "string" ? details["commentId"] : null;
      if (!commentId || runMetaByCommentId.has(commentId)) continue;
      runMetaByCommentId.set(commentId, {
        runId: evt.runId,
        runAgentId: evt.agentId ?? agentIdByRunId.get(evt.runId) ?? null,
      });
    }
    return (comments ?? []).map((comment) => {
      const meta = runMetaByCommentId.get(comment.id);
      return meta ? { ...comment, ...meta } : comment;
    });
  }, [activity, comments, linkedRuns]);

  const issueCostSummary = useMemo(() => {
    let input = 0;
    let output = 0;
    let cached = 0;
    let cost = 0;
    let hasCost = false;
    let hasTokens = false;

    for (const run of linkedRuns ?? []) {
      const usage = asRecord(run.usageJson);
      const result = asRecord(run.resultJson);
      const runInput = usageNumber(usage, "inputTokens", "input_tokens");
      const runOutput = usageNumber(usage, "outputTokens", "output_tokens");
      const runCached = usageNumber(
        usage,
        "cachedInputTokens",
        "cached_input_tokens",
        "cache_read_input_tokens",
      );
      const runCost =
        usageNumber(usage, "costUsd", "cost_usd", "total_cost_usd") ||
        usageNumber(result, "total_cost_usd", "cost_usd", "costUsd");
      if (runCost > 0) hasCost = true;
      if (runInput + runOutput + runCached > 0) hasTokens = true;
      input += runInput;
      output += runOutput;
      cached += runCached;
      cost += runCost;
    }

    return {
      input,
      output,
      cached,
      cost,
      totalTokens: input + output,
      hasCost,
      hasTokens,
    };
  }, [linkedRuns]);

  const invalidateIssue = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.approvals(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId!) });
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
    }
  };

  const updateIssue = useMutation({
    mutationFn: (data: Record<string, unknown>) => issuesApi.update(issueId!, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issueId!) });
      const previous = queryClient.getQueryData(queryKeys.issues.detail(issueId!));
      queryClient.setQueryData(queryKeys.issues.detail(issueId!), (old: Record<string, unknown> | undefined) =>
        old ? { ...old, ...data } : old,
      );
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.issues.detail(issueId!), context.previous);
      }
    },
    onSuccess: (updated) => {
      invalidateIssue();
      const issueRef = updated.identifier ?? `Task ${updated.id.slice(0, 8)}`;
      pushToast({
        dedupeKey: `activity:issue.updated:${updated.id}`,
        title: `${issueRef} updated`,
        body: truncate(updated.title, 96),
        tone: "success",
        action: { label: `View ${issueRef}`, href: `/issues/${updated.identifier ?? updated.id}` },
      });
    },
  });

  const addComment = useMutation({
    mutationFn: ({ body, reopen }: { body: string; reopen?: boolean }) =>
      issuesApi.addComment(issueId!, body, reopen),
    onSuccess: (comment) => {
      invalidateIssue();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId!) });
      const issueRef = issue?.identifier ?? (issueId ? `Task ${issueId.slice(0, 8)}` : "Task");
      if (comment.warning) {
        pushToast({
          dedupeKey: "budget-exhausted",
          title: "Credits depleted",
          body: "Your comment was saved but the agent won't respond. Top up to continue.",
          tone: "error",
          action: { label: "Go to Billing", href: "/billing" },
        });
      } else {
        pushToast({
          dedupeKey: `activity:issue.comment_added:${issueId}:${comment.id}`,
          title: `Comment posted on ${issueRef}`,
          body: issue?.title ? truncate(issue.title, 96) : undefined,
          tone: "success",
          action: issueId ? { label: `View ${issueRef}`, href: `/issues/${issue?.identifier ?? issueId}` } : undefined,
        });
      }
    },
  });

  const addCommentAndReassign = useMutation({
    mutationFn: ({
      body,
      reopen,
      reassignment,
    }: {
      body: string;
      reopen?: boolean;
      reassignment: CommentReassignment;
    }) =>
      issuesApi.update(issueId!, {
        comment: body,
        assigneeAgentId: reassignment.assigneeAgentId,
        assigneeUserId: reassignment.assigneeUserId,
        ...(reopen ? { status: "todo" } : {}),
      }),
    onSuccess: (updated) => {
      invalidateIssue();
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId!) });
      const issueRef = updated.identifier ?? (issueId ? `Task ${issueId.slice(0, 8)}` : "Task");
      pushToast({
        dedupeKey: `activity:issue.reassigned:${updated.id}`,
        title: `${issueRef} reassigned`,
        body: issue?.title ? truncate(issue.title, 96) : undefined,
        tone: "success",
        action: issueId ? { label: `View ${issueRef}`, href: `/issues/${issue?.identifier ?? issueId}` } : undefined,
      });
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return issuesApi.uploadAttachment(selectedCompanyId, issueId!, file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.attachments("issue", issueId!) });
      invalidateIssue();
    },
  });

  const [rejectingPlanId, setRejectingPlanId] = useState<string | null>(null);
  const [rejectComments, setRejectComments] = useState("");

  const approvePlan = useMutation({
    mutationFn: (planId: string) => plansApi.approve(selectedCompanyId!, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.plans(issueId!) });
      pushToast({ title: "Plan approved", tone: "success" });
    },
  });

  const rejectPlan = useMutation({
    mutationFn: ({ planId, comments }: { planId: string; comments?: string }) =>
      plansApi.reject(selectedCompanyId!, planId, comments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.plans(issueId!) });
      setRejectingPlanId(null);
      setRejectComments("");
      pushToast({ title: "Plan rejected", tone: "success" });
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Tasks", href: "/issues" },
      { label: issue?.title ?? issueId ?? "Task" },
    ]);
  }, [setBreadcrumbs, issue, issueId]);

  // Redirect to identifier-based URL if navigated via UUID
  useEffect(() => {
    if (issue?.identifier && issueId !== issue.identifier) {
      navigate(`/issues/${issue.identifier}`, { replace: true });
    }
  }, [issue, issueId, navigate]);

  // Close any stale panel from a previous page
  useEffect(() => {
    return () => closePanel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addDependency = useMutation({
    mutationFn: (dependsOnIssueId: string) => issuesApi.addDependency(issueId!, dependsOnIssueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.dependencies(issueId!) });
    },
  });

  const removeDependency = useMutation({
    mutationFn: (depIssueId: string) => issuesApi.removeDependency(issueId!, depIssueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.dependencies(issueId!) });
    },
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!issue) return null;

  // Ancestors are returned oldest-first from the server (root at end, immediate parent at start)
  const ancestors = issue.ancestors ?? [];

  return (
    <div>
      {/* Parent chain breadcrumb */}
      {ancestors.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap mb-3">
          {[...ancestors].reverse().map((ancestor, i) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              <Link
                to={`/issues/${ancestor.identifier ?? ancestor.id}`}
                className="hover:text-foreground transition-colors truncate max-w-[200px]"
                title={ancestor.title}
              >
                {ancestor.title}
              </Link>
            </span>
          ))}
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-foreground/60 truncate max-w-[200px]">{issue.title}</span>
        </nav>
      )}

      {issue.hiddenAt && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive mb-4">
          <EyeOff className="h-4 w-4 shrink-0" />
          This task is hidden
        </div>
      )}

      {/* ── Two-column layout: details left, comments right ── */}
      <div className="flex flex-col lg:flex-row gap-6">

      {/* ── Left column: task details ── */}
      <div className="w-full lg:w-[55%] lg:shrink-0 min-w-0">

      {/* ── Hero header card ─────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-6">
        <div className="px-5 pt-5 pb-4 space-y-3">
          {/* Top row: status + title inline + slug + actions */}
          <div className="flex items-start gap-2 min-w-0">
            <span className="mt-1 shrink-0" style={{ viewTransitionName: `entity-status-${issue.id}` } as CSSProperties}>
              <StatusIcon
                status={issue.status}
                onChange={(status) => updateIssue.mutate({ status })}
              />
            </span>
            <div className="flex-1 min-w-0" style={{ viewTransitionName: `entity-title-${issue.id}` } as CSSProperties}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <InlineEditor
                  value={issue.title}
                  onSave={(title) => updateIssue.mutate({ title })}
                  as="h2"
                  className="text-xl font-bold tracking-tight"
                />
                <span className="text-xs font-mono text-muted-foreground shrink-0" style={{ viewTransitionName: `entity-id-${issue.id}` } as CSSProperties}>{issue.identifier ?? issue.id.slice(0, 8)}</span>
              </div>
            </div>

            {hasLiveRuns && (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold shrink-0 mt-1", live.bg, live.border, live.text)}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", live.ping)} />
                  <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", live.dot)} />
                </span>
                Running
              </span>
            )}

            <div className="flex items-center shrink-0 gap-0.5 mt-0.5">
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon-xs" className="shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1" align="end">
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/40 text-destructive"
                    onClick={() => {
                      updateIssue.mutate(
                        { hiddenAt: new Date().toISOString() },
                        { onSuccess: () => navigate("/issues/all") },
                      );
                      setMoreOpen(false);
                    }}
                  >
                    <EyeOff className="h-3 w-3" />
                    Hide this task
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Description */}
          <InlineEditor
            value={issue.description ?? ""}
            onSave={(description) => updateIssue.mutate({ description })}
            as="p"
            className="text-sm text-muted-foreground leading-relaxed"
            placeholder="Add a description..."
            multiline
            mentions={mentionOptions}
            imageUploadHandler={async (file) => {
              const attachment = await uploadAttachment.mutateAsync(file);
              return attachment.contentPath;
            }}
          />

          {/* Labels */}
          {(issue.labels ?? []).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {(issue.labels ?? []).slice(0, 6).map((label) => (
                <span
                  key={label.id}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    borderColor: label.color,
                    color: label.color,
                    backgroundColor: `${label.color}1a`,
                  }}
                >
                  {label.name}
                </span>
              ))}
              {(issue.labels ?? []).length > 6 && (
                <span className="text-[10px] text-muted-foreground">+{(issue.labels ?? []).length - 6}</span>
              )}
            </div>
          )}
        </div>

        {/* ── Inline properties ── */}
        <div className="border-t border-border/40 px-5 py-3">
          <IssueProperties issue={issue} onUpdate={(data) => updateIssue.mutate(data)} inline />
        </div>
      </div>

      {/* Attachments */}
      {selectedCompanyId && issueId && (
        <EntityAttachments companyId={selectedCompanyId} linkType="issue" linkId={issueId} />
      )}

      {/* ── Plans ── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plans</span>
          {plans && plans.length > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">{plans.length}</span>
          )}
        </div>
        {!plans || plans.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground/60">Agents will submit plans for approval here</p>
          </div>
        ) : (
          <div className="px-4 py-3 space-y-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="rounded-lg border border-border/50 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-muted-foreground text-xs">v{plan.version}</span>
                    {plan.agentId && (() => {
                      const agent = agentMap.get(plan.agentId);
                      return agent
                        ? <Identity name={agent.name} size="sm" />
                        : <span className="text-muted-foreground font-mono text-xs">{plan.agentId.slice(0, 8)}</span>;
                    })()}
                    <span className="text-xs text-muted-foreground/60">{relativeTime(plan.createdAt)}</span>
                  </div>
                  <StatusBadge status={plan.status} />
                </div>

                <MarkdownBody className="text-sm">
                  {plan.planMarkdown}
                </MarkdownBody>

                {Array.isArray(plan.reviewerComments) && (plan.reviewerComments as Array<{ comment: string; at: string }>).length > 0 && (
                  <div className="rounded border border-border bg-accent/10 p-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Reviewer comments</p>
                    {(plan.reviewerComments as Array<{ comment: string; at: string }>).map((rc, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{rc.comment}</p>
                    ))}
                  </div>
                )}

                {plan.status === "pending_review" && session && (
                  <div className="flex items-center gap-2 pt-1">
                    {rejectingPlanId === plan.id ? (
                      <div className="flex-1 space-y-2">
                        <textarea
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Rejection comments (optional)"
                          rows={2}
                          value={rejectComments}
                          onChange={(e) => setRejectComments(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={rejectPlan.isPending}
                            onClick={() =>
                              rejectPlan.mutate({
                                planId: plan.id,
                                comments: rejectComments || undefined,
                              })
                            }
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            {rejectPlan.isPending ? "Rejecting..." : "Confirm Reject"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRejectingPlanId(null);
                              setRejectComments("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          disabled={approvePlan.isPending}
                          onClick={() => approvePlan.mutate(plan.id)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {approvePlan.isPending ? "Approving..." : "Approve"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRejectingPlanId(plan.id)}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Dependencies ── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dependencies</span>
          {dependencies && dependencies.length > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">{dependencies.length}</span>
          )}
          {allIssues && (
            <div className="ml-auto">
              <DependencyAdder
                currentIssueId={issue.id}
                existingDepIds={new Set((dependencies ?? []).map((d) => d.dependsOnIssueId))}
                issues={allIssues.filter((i) => i.id !== issue.id)}
                onAdd={(id) => addDependency.mutate(id)}
              />
            </div>
          )}
        </div>
        {(!dependencies || dependencies.length === 0) ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground/60">No dependencies yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {dependencies.map((dep) => {
              const depIssue = allIssues?.find((i) => i.id === dep.dependsOnIssueId);
              return (
                <div key={dep.id} className="flex items-center justify-between px-4 py-2.5 text-sm group">
                  <Link
                    to={`/issues/${depIssue?.identifier ?? dep.dependsOnIssueId}`}
                    className="flex items-center gap-2 min-w-0 hover:underline"
                  >
                    {depIssue && <StatusIcon status={depIssue.status} />}
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {depIssue?.identifier ?? dep.dependsOnIssueId.slice(0, 8)}
                    </span>
                    <span className="truncate">{depIssue?.title ?? "Unknown"}</span>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeDependency.mutate(dep.dependsOnIssueId)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Sub-tasks ── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sub-tasks</span>
          {childIssues.length > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">{childIssues.length}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1 text-xs text-muted-foreground hover:text-foreground h-7"
            onClick={() => openNewIssue({ projectId: issue.projectId ?? undefined })}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        {childIssues.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground/60">No sub-tasks yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {childIssues.map((child) => (
              <Link
                key={child.id}
                to={`/issues/${child.identifier ?? child.id}`}
                className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StatusIcon status={child.status} />
                  <PriorityIcon priority={child.priority} />
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {child.identifier ?? child.id.slice(0, 8)}
                  </span>
                  <span className="truncate">{child.title}</span>
                </div>
                {child.assigneeAgentId && (() => {
                  const name = agentMap.get(child.assigneeAgentId)?.name;
                  return name
                    ? <Identity name={name} size="sm" />
                    : <span className="text-muted-foreground font-mono text-xs">{child.assigneeAgentId.slice(0, 8)}</span>;
                })()}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Activity (collapsible) ── */}
      {activity && activity.length > 0 && (
        <Collapsible
          open={secondaryOpen.activity}
          onOpenChange={(open) => setSecondaryOpen((prev) => ({ ...prev, activity: open }))}
          className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/20 transition-colors">
            <div className="flex items-center gap-2">
              <ActivityIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity</span>
              <span className="text-xs text-muted-foreground/60 tabular-nums">{activity.length}</span>
            </div>
            <ChevronDown
              className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform", secondaryOpen.activity && "rotate-180")}
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

      {linkedApprovals && linkedApprovals.length > 0 && (
        <Collapsible
          open={secondaryOpen.approvals}
          onOpenChange={(open) => setSecondaryOpen((prev) => ({ ...prev, approvals: open }))}
          className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/20 transition-colors">
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approvals</span>
              <span className="text-xs text-muted-foreground/60 tabular-nums">{linkedApprovals.length}</span>
            </div>
            <ChevronDown
              className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform", secondaryOpen.approvals && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border/40 divide-y divide-border/30">
              {linkedApprovals.map((approval) => (
                <Link
                  key={approval.id}
                  to={`/approvals/${approval.id}`}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs hover:bg-accent/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge status={approval.status} />
                    <span className="font-medium">
                      {approval.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    <span className="font-mono text-muted-foreground/60">{approval.id.slice(0, 8)}</span>
                  </div>
                  <span className="text-muted-foreground/60">{relativeTime(approval.createdAt)}</span>
                </Link>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {linkedRuns && linkedRuns.length > 0 && (
        <Collapsible
          open={secondaryOpen.cost}
          onOpenChange={(open) => setSecondaryOpen((prev) => ({ ...prev, cost: open }))}
          className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-4"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/20 transition-colors">
            <div className="flex items-center gap-2">
              <Coins className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cost Summary</span>
            </div>
            <ChevronDown
              className={cn("h-3.5 w-3.5 text-muted-foreground/60 transition-transform", secondaryOpen.cost && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border/40 px-4 py-3">
              {!issueCostSummary.hasCost && !issueCostSummary.hasTokens ? (
                <div className="text-xs text-muted-foreground/60">No cost data yet.</div>
              ) : (
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {issueCostSummary.hasCost && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground/60 block">Total cost</span>
                      <span className="font-semibold text-foreground text-sm tabular-nums">
                        ${issueCostSummary.cost.toFixed(4)}
                      </span>
                    </div>
                  )}
                  {issueCostSummary.hasTokens && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-muted-foreground/60 block">Tokens</span>
                      <span className="font-medium text-foreground/80 tabular-nums">
                        {formatTokens(issueCostSummary.totalTokens)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50 block">
                        {formatTokens(issueCostSummary.input)} in · {formatTokens(issueCostSummary.output)} out
                        {issueCostSummary.cached > 0 && ` · ${formatTokens(issueCostSummary.cached)} cached`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      </div>{/* end left column */}

      {/* ── Right column: comment thread ── */}
      <div className="w-full lg:flex-1 min-w-0">
        <div className="lg:sticky lg:top-0 rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 6rem)" }}>
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 shrink-0">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Comments</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {commentsWithRunMeta.length + timelineRuns.length}
            </span>
          </div>
          <CommentThread
            comments={commentsWithRunMeta}
            linkedRuns={timelineRuns}
            issueStatus={issue.status}
            agentMap={agentMap}
            draftKey={`substaff:issue-comment-draft:${issue.id}`}
            enableReassign
            reassignOptions={commentReassignOptions}
            currentAssigneeValue={currentAssigneeValue}
            mentions={mentionOptions}
            onAdd={async (body, reopen, reassignment) => {
              if (reassignment) {
                await addCommentAndReassign.mutateAsync({ body, reopen, reassignment });
                return;
              }
              await addComment.mutateAsync({ body, reopen });
            }}
            imageUploadHandler={async (file) => {
              const attachment = await uploadAttachment.mutateAsync(file);
              return attachment.contentPath;
            }}
            onAttachImage={async (file) => {
              await uploadAttachment.mutateAsync(file);
            }}
            liveRunSlot={<LiveRunWidget issueId={issueId!} companyId={issue.companyId} />}
          />
        </div>
      </div>

      </div>{/* end two-column layout */}

    </div>
  );
}
