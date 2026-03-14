import { useEffect, useMemo, useState, useCallback, useRef, useDeferredValue } from "react";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { goalStatusLabel, formatLabel } from "../lib/labels";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { PageSkeleton } from "../components/PageSkeleton";
import { ListPreviewLayout } from "../components/ListPreviewLayout";
import { GoalPreview } from "../components/GoalPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Target, Plus, Filter, ArrowUpDown, Check, X, ChevronRight, Search, Bot, Crosshair, GitMerge } from "lucide-react";
import { FeatureInfoSection } from "../components/FeatureInfoSection";
import { cn, formatDate } from "../lib/utils";
import type { Goal } from "@substaff/shared";

/* ── Helpers ── */

const goalStatusOrder = ["active", "planned", "achieved", "cancelled"];

function statusLabel(status: string): string {
  return goalStatusLabel[status] ?? formatLabel(status);
}

/* ── View state ── */

type GoalViewState = {
  statuses: string[];
  sortField: "status" | "title" | "created" | "updated";
  sortDir: "asc" | "desc";
  groupBy: "status" | "none";
  collapsedGroups: string[];
};

const defaultViewState: GoalViewState = {
  statuses: [],
  sortField: "updated",
  sortDir: "desc",
  groupBy: "none",
  collapsedGroups: [],
};

const quickFilterPresets = [
  { label: "All", statuses: [] as string[] },
  { label: "Active", statuses: ["active"] },
  { label: "Planned", statuses: ["planned"] },
  { label: "Achieved", statuses: ["achieved"] },
];

function getViewState(key: string): GoalViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Drop stale keys from old view state shape
      const { levels: _l, viewMode: _v, ...rest } = parsed;
      return { ...defaultViewState, ...rest };
    }
  } catch { /* ignore */ }
  return { ...defaultViewState };
}

function saveViewState(key: string, state: GoalViewState) {
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

function applyFilters(goals: Goal[], state: GoalViewState): Goal[] {
  let result = goals;
  if (state.statuses.length > 0) result = result.filter((g) => state.statuses.includes(g.status));
  return result;
}

function sortGoals(goals: Goal[], state: GoalViewState): Goal[] {
  const sorted = [...goals];
  const dir = state.sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (state.sortField) {
      case "status":
        return dir * (goalStatusOrder.indexOf(a.status) - goalStatusOrder.indexOf(b.status));
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

function countActiveFilters(state: GoalViewState): number {
  return state.statuses.length > 0 ? 1 : 0;
}

function groupByField(goals: Goal[], field: string): Record<string, Goal[]> {
  const groups: Record<string, Goal[]> = {};
  for (const goal of goals) {
    const key = field === "status" ? goal.status : "all";
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(goal);
  }
  return groups;
}

/* ── Component ── */

export function Goals() {
  const { selectedCompanyId } = useCompany();
  const { openNewGoal } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Goals" }]);
  }, [setBreadcrumbs]);

  const viewStateKey = "substaff:goals-view";
  const scopedKey = selectedCompanyId ? `${viewStateKey}:${selectedCompanyId}` : viewStateKey;

  const [viewState, setViewState] = useState<GoalViewState>(() => getViewState(scopedKey));
  const [goalSearch, setGoalSearch] = useState("");
  const deferredSearch = useDeferredValue(goalSearch);

  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(getViewState(scopedKey));
    }
  }, [scopedKey]);

  const updateView = useCallback((patch: Partial<GoalViewState>) => {
    setViewState((prev) => {
      const next = { ...prev, ...patch };
      saveViewState(scopedKey, next);
      return next;
    });
  }, [scopedKey]);

  const { data: goals, isLoading, error } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      goalsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(selectedCompanyId!) });
    },
  });

  const filtered = useMemo(() => {
    let source = goals ?? [];
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      source = source.filter((g) => g.title.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q));
    }
    const filteredByControls = applyFilters(source, viewState);
    return sortGoals(filteredByControls, viewState);
  }, [goals, viewState, deferredSearch]);

  const activeFilterCount = countActiveFilters(viewState);

  const groupedContent = useMemo(() => {
    if (viewState.groupBy === "none") {
      return [{ key: "__all", label: null as string | null, items: filtered }];
    }
    const order = goalStatusOrder;
    const groups = groupByField(filtered, viewState.groupBy);
    return order
      .filter((k) => groups[k]?.length)
      .map((k) => ({ key: k, label: statusLabel(k), items: groups[k]! }));
  }, [filtered, viewState.groupBy]);

  const agentName = useCallback((id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  }, [agents]);

  // Preview panel state — always show a preview, falling back to first goal
  const [hoveredGoalId, setHoveredGoalId] = useState<string | null>(null);
  const [previewLocked, setPreviewLocked] = useState(false);
  const firstGoalId = filtered[0]?.id ?? null;
  const activePreviewId = hoveredGoalId ?? firstGoalId;
  const activeGoal = useMemo(() => {
    if (!activePreviewId) return null;
    return (goals ?? []).find((g) => g.id === activePreviewId) ?? null;
  }, [goals, activePreviewId]);

  const previewContent = activeGoal ? (
    <GoalPreview goal={activeGoal} agentName={agentName} />
  ) : null;

  const handleRowHover = useCallback((goalId: string | null) => {
    if (!previewLocked && goalId) setHoveredGoalId(goalId);
    // Seed detail cache on hover so navigating to the detail page skips the skeleton
    if (goalId) {
      const g = goals?.find((x) => x.id === goalId);
      if (g) queryClient.setQueryData(queryKeys.goals.detail(goalId), g);
    }
  }, [previewLocked, goals, queryClient]);

  const handlePreviewClose = useCallback(() => {
    setHoveredGoalId(null);
    setPreviewLocked(false);
  }, []);

  // Keep a ref to the active preview goal so the seed callback
  // still works after the mouse leaves the row and enters the panel.
  const hoveredGoalRef = useRef(activeGoal);
  if (activeGoal) hoveredGoalRef.current = activeGoal;

  const seedDetailCache = useCallback(() => {
    const g = hoveredGoalRef.current;
    if (!g) return;
    queryClient.setQueryData(queryKeys.goals.detail(g.id), g);
  }, [queryClient]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Target} message="Select a workspace to view goals." />;
  }

  return (
    <ListPreviewLayout
      previewContent={previewContent}
      previewKey={activePreviewId}
      detailUrl={activePreviewId ? `/goals/${activePreviewId}` : null}
      onBeforeNavigate={seedDetailCache}
      onPreviewClose={handlePreviewClose}
      alwaysOpen
    >
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">Track objectives and key results for your company.</p>
      </div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button size="sm" className="h-8 px-3 text-xs" onClick={() => openNewGoal()}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Goal
          </Button>
          <div className="relative w-48 sm:w-64 md:w-80">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={goalSearch}
              onChange={(e) => setGoalSearch(e.target.value)}
              placeholder="Search goals..."
              className="h-8 pl-8 text-xs rounded-lg border-border/60 bg-muted/30 placeholder:text-muted-foreground/40"
              aria-label="Search goals"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
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
                      updateView({ statuses: [] });
                    }}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(400px,calc(100vw-2rem))] p-0">
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => updateView({ statuses: [] })}
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

                <div className="border-t border-border" />

                {/* Status */}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div className="space-y-0.5">
                    {goalStatusOrder.map((s) => (
                      <label key={s} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/40 cursor-pointer">
                        <Checkbox
                          checked={viewState.statuses.includes(s)}
                          onCheckedChange={() => updateView({ statuses: toggleInArray(viewState.statuses, s) })}
                        />
                        <span className="text-sm">{statusLabel(s)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort */}
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

          {/* Group */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 h-7 rounded-full border border-border/60 bg-muted/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-border">
                <Check className="h-3 w-3" />
                <span className="hidden sm:inline">Group</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-0">
              <div className="p-2 space-y-0.5">
                {([
                  ["status", "Status"],
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
        </div>
      </div>

      {isLoading && <PageSkeleton variant="list" />}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={Target}
          message="No goals match the current filters."
          action="New Goal"
          onAction={() => openNewGoal()}
        />
      )}

      {!isLoading && filtered.length > 0 &&
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
                  <span className="text-sm font-semibold">
                    {group.label}
                  </span>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto text-muted-foreground"
                  onClick={() => openNewGoal()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            <CollapsibleContent>
              <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs">
              {group.items.map((goal) => (
                <Link
                  key={goal.id}
                  to={`/goals/${goal.id}`}
                  viewTransition
                  className={cn(
                    "flex items-center gap-3 px-4 h-11 text-sm cursor-pointer hover:bg-accent/40 transition-colors no-underline text-inherit",
                    activePreviewId === goal.id && "bg-accent/30",
                  )}
                  onMouseEnter={() => handleRowHover(goal.id)}
                  onMouseLeave={() => handleRowHover(null)}
                >
                  <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span
                    className="truncate flex-1 min-w-0"
                    style={{ viewTransitionName: `entity-title-${goal.id}` } as React.CSSProperties}
                  >{goal.title}</span>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                    {goal.ownerAgentId && agentName(goal.ownerAgentId) && (
                      <div className="hidden sm:block" style={{ viewTransitionName: `entity-owner-${goal.id}` } as React.CSSProperties}>
                        <Identity name={agentName(goal.ownerAgentId)!} size="sm" />
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground hidden lg:inline whitespace-nowrap">
                      {formatDate(goal.createdAt)}
                    </span>
                    <span className="text-xs text-muted-foreground hidden lg:inline whitespace-nowrap">
                      {formatDate(goal.updatedAt)}
                    </span>
                    <span style={{ viewTransitionName: `entity-status-${goal.id}` } as React.CSSProperties}>
                      <StatusBadge status={goal.status} />
                    </span>
                  </div>
                </Link>
              ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))
      }

      {!isLoading && (goals ?? []).length < 5 && (
        <FeatureInfoSection
          title="How goals work"
          subtitle="Goals align your AI agents around company-wide objectives and track measurable progress."
          features={[
            {
              icon: Target,
              title: "Set company objectives",
              description:
                "Define high-level goals like revenue targets, product launches, or growth milestones. Goals give your agents a shared sense of direction.",
            },
            {
              icon: Bot,
              title: "Assign to agents",
              description:
                "Each goal can be owned by an agent who is responsible for driving progress. The agent will prioritize work that moves the goal forward.",
            },
            {
              icon: GitMerge,
              title: "Cascade alignment",
              description:
                "Link goals to projects and tasks so every piece of work ties back to a company objective. Nothing falls through the cracks.",
            },
          ]}
        />
      )}
    </div>
    </ListPreviewLayout>
  );
}
