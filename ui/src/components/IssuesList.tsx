import { useEffect, useDeferredValue, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { groupBy } from "../lib/groupBy";
import { formatDate, cn } from "../lib/utils";
import { live } from "../lib/status-colors";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { EmptyState } from "./EmptyState";
import { Identity } from "./Identity";
import { PageSkeleton } from "./PageSkeleton";
import { ListPreviewLayout } from "./ListPreviewLayout";
import { IssuePreview } from "./IssuePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CircleDot, Plus, Filter, ArrowUpDown, Layers, Check, X, ChevronRight, List, Columns3, User, Search } from "lucide-react";
import { KanbanBoard } from "./KanbanBoard";
import type { Issue } from "@substaff/shared";

/* ── Helpers ── */

const statusOrder = ["in_progress", "todo", "backlog", "in_review", "blocked", "done", "cancelled"];
const priorityOrder = ["critical", "high", "medium", "low"];

import { issueStatusLabel, formatLabel } from "../lib/labels";

function statusLabel(status: string): string {
  return issueStatusLabel[status] ?? formatLabel(status);
}

/* ── View state ── */

export type IssueViewState = {
  statuses: string[];
  priorities: string[];
  assignees: string[];
  labels: string[];
  sortField: "status" | "priority" | "title" | "created" | "updated";
  sortDir: "asc" | "desc";
  groupBy: "status" | "priority" | "assignee" | "none";
  viewMode: "list" | "board";
  collapsedGroups: string[];
};

const defaultViewState: IssueViewState = {
  statuses: [],
  priorities: [],
  assignees: [],
  labels: [],
  sortField: "updated",
  sortDir: "desc",
  groupBy: "none",
  viewMode: "list",
  collapsedGroups: [],
};

const quickFilterPresets = [
  { label: "All", statuses: [] as string[] },
  { label: "Active", statuses: ["todo", "in_progress", "in_review", "blocked"] },
  { label: "Later", statuses: ["backlog"] },
  { label: "Done", statuses: ["done", "cancelled"] },
];

function getViewState(key: string): IssueViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaultViewState, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultViewState };
}

function saveViewState(key: string, state: IssueViewState) {
  localStorage.setItem(key, JSON.stringify(state));
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function applyFilters(issues: Issue[], state: IssueViewState): Issue[] {
  let result = issues;
  if (state.statuses.length > 0) result = result.filter((i) => state.statuses.includes(i.status));
  if (state.priorities.length > 0) result = result.filter((i) => state.priorities.includes(i.priority));
  if (state.assignees.length > 0) result = result.filter((i) => i.assigneeAgentId != null && state.assignees.includes(i.assigneeAgentId));
  if (state.labels.length > 0) result = result.filter((i) => (i.labelIds ?? []).some((id) => state.labels.includes(id)));
  return result;
}

function sortIssues(issues: Issue[], state: IssueViewState): Issue[] {
  const sorted = [...issues];
  const dir = state.sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (state.sortField) {
      case "status":
        return dir * (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
      case "priority":
        return dir * (priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "created":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "updated":
        return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      default:
        return 0;
    }
  });
  return sorted;
}

function countActiveFilters(state: IssueViewState): number {
  let count = 0;
  if (state.statuses.length > 0) count++;
  if (state.priorities.length > 0) count++;
  if (state.assignees.length > 0) count++;
  if (state.labels.length > 0) count++;
  return count;
}

/* ── Component ── */

interface Agent {
  id: string;
  name: string;
}

interface IssuesListProps {
  issues: Issue[];
  isLoading?: boolean;
  error?: Error | null;
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  projectId?: string;
  viewStateKey: string;
  initialAssignees?: string[];
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  /** Rendered above the list but inside the preview-layout wrapper so it respects the preview margin. */
  header?: React.ReactNode;
  /** Extra content rendered inside the layout wrapper (after the list) so it respects the preview panel margin. */
  children?: React.ReactNode;
}

export function IssuesList({
  issues,
  isLoading,
  error,
  agents,
  liveIssueIds,
  projectId,
  viewStateKey,
  initialAssignees,
  onUpdateIssue,
  header,
  children,
}: IssuesListProps) {
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();

  // Scope the storage key per company so folding/view state is independent across companies.
  const scopedKey = selectedCompanyId ? `${viewStateKey}:${selectedCompanyId}` : viewStateKey;

  const [viewState, setViewState] = useState<IssueViewState>(() => {
    if (initialAssignees) {
      return { ...defaultViewState, assignees: initialAssignees, statuses: [] };
    }
    return getViewState(scopedKey);
  });
  const [assigneePickerIssueId, setAssigneePickerIssueId] = useState<string | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [issueSearch, setIssueSearch] = useState("");
  const deferredIssueSearch = useDeferredValue(issueSearch);
  const normalizedIssueSearch = deferredIssueSearch.trim();

  // Reload view state from localStorage when company changes (scopedKey changes).
  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(initialAssignees
        ? { ...defaultViewState, assignees: initialAssignees, statuses: [] }
        : getViewState(scopedKey));
    }
  }, [scopedKey, initialAssignees]);

  const updateView = useCallback((patch: Partial<IssueViewState>) => {
    setViewState((prev) => {
      const next = { ...prev, ...patch };
      saveViewState(scopedKey, next);
      return next;
    });
  }, [scopedKey]);

  const { data: searchedIssues = [] } = useQuery({
    queryKey: queryKeys.issues.search(selectedCompanyId!, normalizedIssueSearch, projectId),
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: normalizedIssueSearch, projectId }),
    enabled: !!selectedCompanyId && normalizedIssueSearch.length > 0,
  });

  const agentName = useCallback((id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  }, [agents]);

  const filtered = useMemo(() => {
    const sourceIssues = normalizedIssueSearch.length > 0 ? searchedIssues : issues;
    const filteredByControls = applyFilters(sourceIssues, viewState);
    return sortIssues(filteredByControls, viewState);
  }, [issues, searchedIssues, viewState, normalizedIssueSearch]);

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(selectedCompanyId!),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeFilterCount = countActiveFilters(viewState);

  const groupedContent = useMemo(() => {
    if (viewState.groupBy === "none") {
      return [{ key: "__all", label: null as string | null, items: filtered }];
    }
    if (viewState.groupBy === "status") {
      const groups = groupBy(filtered, (i) => i.status);
      return statusOrder
        .filter((s) => groups[s]?.length)
        .map((s) => ({ key: s, label: statusLabel(s), items: groups[s]! }));
    }
    if (viewState.groupBy === "priority") {
      const groups = groupBy(filtered, (i) => i.priority);
      return priorityOrder
        .filter((p) => groups[p]?.length)
        .map((p) => ({ key: p, label: statusLabel(p), items: groups[p]! }));
    }
    // assignee
    const groups = groupBy(filtered, (i) => i.assigneeAgentId ?? "__unassigned");
    return Object.keys(groups).map((key) => ({
      key,
      label: key === "__unassigned" ? "Unassigned" : (agentName(key) ?? key.slice(0, 8)),
      items: groups[key]!,
    }));
  }, [filtered, viewState.groupBy, agents]); // eslint-disable-line react-hooks/exhaustive-deps

  const newIssueDefaults = (groupKey?: string) => {
    const defaults: Record<string, string> = {};
    if (projectId) defaults.projectId = projectId;
    if (groupKey) {
      if (viewState.groupBy === "status") defaults.status = groupKey;
      else if (viewState.groupBy === "priority") defaults.priority = groupKey;
      else if (viewState.groupBy === "assignee" && groupKey !== "__unassigned") defaults.assigneeAgentId = groupKey;
    }
    return defaults;
  };

  const assignIssue = (issueId: string, assigneeAgentId: string | null) => {
    onUpdateIssue(issueId, { assigneeAgentId, assigneeUserId: null });
    setAssigneePickerIssueId(null);
    setAssigneeSearch("");
  };

  // Preview panel state — always show a preview, falling back to first issue
  const [hoveredIssueId, setHoveredIssueId] = useState<string | null>(null);
  const [previewLocked, setPreviewLocked] = useState(false);
  const firstIssueId = filtered[0]?.id ?? null;
  const activePreviewId = hoveredIssueId ?? firstIssueId;
  const activeIssue = useMemo(() => {
    if (!activePreviewId) return null;
    const sourceIssues = normalizedIssueSearch.length > 0 ? searchedIssues : issues;
    return sourceIssues.find((i) => i.id === activePreviewId) ?? null;
  }, [issues, searchedIssues, normalizedIssueSearch, activePreviewId]);

  const previewContent = activeIssue ? (
    <IssuePreview
      issue={activeIssue}
      agentName={agentName}
      isLive={liveIssueIds?.has(activeIssue.id)}
    />
  ) : null;

  const queryClient = useQueryClient();

  const handleRowHover = useCallback((issueId: string | null) => {
    if (!previewLocked && issueId) setHoveredIssueId(issueId);
    if (issueId) {
      const i = issues.find((x) => x.id === issueId);
      if (i) queryClient.setQueryData(queryKeys.issues.detail(i.identifier ?? i.id), i);
    }
  }, [previewLocked, issues, queryClient]);

  const handlePreviewClose = useCallback(() => {
    setHoveredIssueId(null);
    setPreviewLocked(false);
  }, []);
  const hoveredIssueRef = useRef(activeIssue);
  if (activeIssue) hoveredIssueRef.current = activeIssue;

  const seedDetailCache = useCallback(() => {
    const i = hoveredIssueRef.current;
    if (!i) return;
    queryClient.setQueryData(queryKeys.issues.detail(i.identifier ?? i.id), i);
  }, [queryClient]);

  return (
    <ListPreviewLayout
      previewContent={previewContent}
      previewKey={activePreviewId}
      detailUrl={activeIssue ? `/issues/${activeIssue.identifier ?? activeIssue.id}` : null}
      onBeforeNavigate={seedDetailCache}
      onPreviewClose={handlePreviewClose}
      alwaysOpen
    >
    {header}
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">Manage and track tasks across your team.</p>
      </div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button size="sm" className="h-8 px-3 text-xs" onClick={() => openNewIssue(newIssueDefaults())}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Task
          </Button>
          <div className="relative w-48 sm:w-64 md:w-80">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={issueSearch}
              onChange={(e) => setIssueSearch(e.target.value)}
              placeholder="Search tasks..."
              className="h-8 pl-8 text-xs rounded-lg border-border/60 bg-muted/30 placeholder:text-muted-foreground/40"
              aria-label="Search tasks"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* View mode toggle */}
          <div className="flex items-center h-7 border border-border/60 rounded-full overflow-hidden mr-0.5">
            <button
              className={cn(
                "flex items-center justify-center h-full px-2 transition-colors",
                viewState.viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => updateView({ viewMode: "list" })}
              title="List view"
            >
              <List className="h-3 w-3" />
            </button>
            <button
              className={cn(
                "flex items-center justify-center h-full px-2 transition-colors",
                viewState.viewMode === "board" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => updateView({ viewMode: "board" })}
              title="Board view"
            >
              <Columns3 className="h-3 w-3" />
            </button>
          </div>

          {/* Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 rounded-full border px-3 text-xs font-medium transition-colors",
                  activeFilterCount > 0
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Filter className="h-3 w-3" />
                <span className="hidden sm:inline">{activeFilterCount > 0 ? `Filter (${activeFilterCount})` : "Filter"}</span>
                {activeFilterCount > 0 && (
                  <X
                    className="h-3 w-3 -mr-0.5 hidden sm:block opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateView({ statuses: [], priorities: [], assignees: [], labels: [] });
                    }}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(480px,calc(100vw-2rem))] p-0">
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => updateView({ statuses: [], priorities: [], assignees: [], labels: [] })}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Quick filters */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Quick filters</span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickFilterPresets.map((preset) => {
                      const isActive = arraysEqual(viewState.statuses, preset.statuses);
                      return (
                        <button
                          key={preset.label}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                          }`}
                          onClick={() => updateView({ statuses: isActive ? [] : [...preset.statuses] })}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border/50" />

                {/* Multi-column filter sections */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {/* Status */}
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="space-y-0.5">
                      {statusOrder.map((s) => (
                        <label key={s} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/40 cursor-pointer">
                          <Checkbox
                            checked={viewState.statuses.includes(s)}
                            onCheckedChange={() => updateView({ statuses: toggleInArray(viewState.statuses, s) })}
                          />
                          <StatusIcon status={s} />
                          <span className="text-sm">{statusLabel(s)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Priority + Assignee stacked in right column */}
                  <div className="space-y-3">
                    {/* Priority */}
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Priority</span>
                      <div className="space-y-0.5">
                        {priorityOrder.map((p) => (
                          <label key={p} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/40 cursor-pointer">
                            <Checkbox
                              checked={viewState.priorities.includes(p)}
                              onCheckedChange={() => updateView({ priorities: toggleInArray(viewState.priorities, p) })}
                            />
                            <PriorityIcon priority={p} />
                            <span className="text-sm">{statusLabel(p)}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Assignee */}
                    {agents && agents.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Assignee</span>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto">
                          {agents.map((agent) => (
                            <label key={agent.id} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/40 cursor-pointer">
                              <Checkbox
                                checked={viewState.assignees.includes(agent.id)}
                                onCheckedChange={() => updateView({ assignees: toggleInArray(viewState.assignees, agent.id) })}
                              />
                              <span className="text-sm">{agent.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {labels && labels.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Labels</span>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto">
                          {labels.map((label) => (
                            <label key={label.id} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/40 cursor-pointer">
                              <Checkbox
                                checked={viewState.labels.includes(label.id)}
                                onCheckedChange={() => updateView({ labels: toggleInArray(viewState.labels, label.id) })}
                              />
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                              <span className="text-sm">{label.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort (list view only) */}
          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1.5 h-7 rounded-full border border-border/60 bg-muted/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-border">
                  <ArrowUpDown className="h-3 w-3" />
                  <span className="hidden sm:inline">Sort</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-0">
                <div className="p-2 space-y-0.5">
                  {([
                    ["status", "Status"],
                    ["priority", "Priority"],
                    ["title", "Title"],
                    ["created", "Created"],
                    ["updated", "Updated"],
                  ] as const).map(([field, label]) => (
                    <button
                      key={field}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${
                        viewState.sortField === field ? "bg-accent/50 text-foreground" : "hover:bg-accent/40 text-muted-foreground"
                      }`}
                      onClick={() => {
                        if (viewState.sortField === field) {
                          updateView({ sortDir: viewState.sortDir === "asc" ? "desc" : "asc" });
                        } else {
                          updateView({ sortField: field, sortDir: "asc" });
                        }
                      }}
                    >
                      <span>{label}</span>
                      {viewState.sortField === field && (
                        <span className="text-xs text-muted-foreground">
                          {viewState.sortDir === "asc" ? "\u2191" : "\u2193"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Group (list view only) */}
          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1.5 h-7 rounded-full border border-border/60 bg-muted/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-border">
                  <Layers className="h-3 w-3" />
                  <span className="hidden sm:inline">Group</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-0">
                <div className="p-2 space-y-0.5">
                  {([
                    ["status", "Status"],
                    ["priority", "Priority"],
                    ["assignee", "Assignee"],
                    ["none", "None"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${
                        viewState.groupBy === value ? "bg-accent/50 text-foreground" : "hover:bg-accent/40 text-muted-foreground"
                      }`}
                      onClick={() => updateView({ groupBy: value })}
                    >
                      <span>{label}</span>
                      {viewState.groupBy === value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {isLoading && <PageSkeleton variant="issues-list" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && filtered.length === 0 && viewState.viewMode === "list" && (
        <EmptyState
          icon={CircleDot}
          message="No tasks match the current filters or search."
          action="Create Task"
          onAction={() => openNewIssue(newIssueDefaults())}
        />
      )}

      {viewState.viewMode === "board" ? (
        <KanbanBoard
          issues={filtered}
          agents={agents}
          liveIssueIds={liveIssueIds}
          onUpdateIssue={onUpdateIssue}
        />
      ) : (
        groupedContent.map((group) => (
          <Collapsible
            key={group.key}
            open={!viewState.collapsedGroups.includes(group.key)}
            onOpenChange={(open) => {
              updateView({
                collapsedGroups: open
                  ? viewState.collapsedGroups.filter((k) => k !== group.key)
                  : [...viewState.collapsedGroups, group.key],
              });
            }}
          >
            {group.label && (
              <div className="flex items-center py-1.5 pl-1 pr-3">
                <CollapsibleTrigger className="flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                  <span className="text-sm font-semibold ">
                    {group.label}
                  </span>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto text-muted-foreground"
                  onClick={() => openNewIssue(newIssueDefaults(group.key))}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            <CollapsibleContent>
              <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs">
              {group.items.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.identifier ?? issue.id}`}
                  viewTransition
                  className={cn(
                    "flex items-center gap-3 px-4 h-11 text-sm cursor-pointer hover:bg-accent/40 transition-colors no-underline text-inherit",
                    activePreviewId === issue.id && "bg-primary/5",
                  )}
                  onMouseEnter={() => handleRowHover(issue.id)}
                  onMouseLeave={() => handleRowHover(null)}
                >
                  <div className="shrink-0 flex items-center" style={{ viewTransitionName: `entity-status-${issue.id}` } as React.CSSProperties} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <StatusIcon
                      status={issue.status}
                      onChange={(s) => onUpdateIssue(issue.id, { status: s })}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground font-mono shrink-0" style={{ viewTransitionName: `entity-id-${issue.id}` } as React.CSSProperties}>
                    {issue.identifier ?? issue.id.slice(0, 8)}
                  </span>
                  <span
                    className="truncate flex-1 min-w-0"
                    style={{ viewTransitionName: `entity-title-${issue.id}` } as React.CSSProperties}
                  >{issue.title}</span>
                  {(issue.labels ?? []).length > 0 && (
                    <div className="hidden md:flex items-center gap-1 max-w-[240px] overflow-hidden">
                      {(issue.labels ?? []).slice(0, 3).map((label) => (
                        <span
                          key={label.id}
                          className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            borderColor: label.color,
                            color: label.color,
                            backgroundColor: `${label.color}1f`,
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                      {(issue.labels ?? []).length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{(issue.labels ?? []).length - 3}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                    <span className="hidden sm:inline-flex items-center gap-1 shrink-0">
                      <PriorityIcon priority={issue.priority} />
                    </span>
                    {liveIssueIds?.has(issue.id) && (
                      <span className={cn("inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-full", live.bg)}>
                        <span className="relative flex h-2 w-2">
                          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", live.ping)} />
                          <span className={cn("relative inline-flex rounded-full h-2 w-2", live.dot)} />
                        </span>
                        <span className={cn("text-[11px] font-medium hidden sm:inline", live.text)}>Live</span>
                      </span>
                    )}
                    <div className="hidden sm:block">
                      <Popover
                        open={assigneePickerIssueId === issue.id}
                        onOpenChange={(open) => {
                          setAssigneePickerIssueId(open ? issue.id : null);
                          if (!open) setAssigneeSearch("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            className="flex w-[180px] shrink-0 items-center rounded-md px-2 py-1 hover:bg-accent/40 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            {issue.assigneeAgentId && agentName(issue.assigneeAgentId) ? (
                              <Identity name={agentName(issue.assigneeAgentId)!} size="sm" />
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30">
                                  <User className="h-3 w-3" />
                                </span>
                                Assignee
                              </span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-56 p-1"
                          align="end"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDownOutside={() => setAssigneeSearch("")}
                        >
                          <input
                            className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border/50 mb-1 placeholder:text-muted-foreground/50"
                            placeholder="Search team members..."
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                            autoFocus
                          />
                          <div className="max-h-48 overflow-y-auto overscroll-contain">
                            <button
                              className={cn(
                                "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/40",
                                !issue.assigneeAgentId && "bg-accent"
                              )}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                assignIssue(issue.id, null);
                              }}
                            >
                              No assignee
                            </button>
                            {(agents ?? [])
                              .filter((agent) => {
                                if (!assigneeSearch.trim()) return true;
                                return agent.name.toLowerCase().includes(assigneeSearch.toLowerCase());
                              })
                              .map((agent) => (
                                <button
                                  key={agent.id}
                                  className={cn(
                                    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/40 text-left",
                                    issue.assigneeAgentId === agent.id && "bg-accent"
                                  )}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    assignIssue(issue.id, agent.id);
                                  }}
                                >
                                  <Identity name={agent.name} size="sm" className="min-w-0" />
                                </button>
                              ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <span className="text-xs text-muted-foreground hidden sm:inline whitespace-nowrap">
                      {formatDate(issue.createdAt)}
                    </span>
                    <span className="text-xs text-muted-foreground hidden lg:inline whitespace-nowrap">
                      {formatDate(issue.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))
      )}
    </div>
    {children}
    </ListPreviewLayout>
  );
}
