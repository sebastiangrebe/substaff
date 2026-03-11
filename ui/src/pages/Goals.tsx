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
import { Target, Plus, Filter, ArrowUpDown, Check, X, ChevronRight, Search } from "lucide-react";
import { cn } from "../lib/utils";
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
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Goals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track objectives and key results for your company.</p>
      </div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button size="sm" variant="outline" onClick={() => openNewGoal()}>
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">New Goal</span>
          </Button>
          <div className="relative w-48 sm:w-64 md:w-80">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={goalSearch}
              onChange={(e) => setGoalSearch(e.target.value)}
              placeholder="Search goals..."
              className="pl-7 text-xs sm:text-sm"
              aria-label="Search goals"
            />
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {/* Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={`text-xs ${activeFilterCount > 0 ? "text-primary" : ""}`}>
                <Filter className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                <span className="hidden sm:inline">{activeFilterCount > 0 ? `Filters: ${activeFilterCount}` : "Filter"}</span>
                {activeFilterCount > 0 && (
                  <span className="sm:hidden text-[10px] font-medium ml-0.5">{activeFilterCount}</span>
                )}
                {activeFilterCount > 0 && (
                  <X
                    className="h-3 w-3 ml-1 hidden sm:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateView({ statuses: [] });
                    }}
                  />
                )}
              </Button>
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
              <Button variant="ghost" size="sm" className="text-xs">
                <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                <span className="hidden sm:inline">Sort</span>
              </Button>
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
              <Button variant="ghost" size="sm" className="text-xs">
                <Check className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                <span className="hidden sm:inline">Group</span>
              </Button>
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
              {group.items.map((goal) => (
                <Link
                  key={goal.id}
                  to={`/goals/${goal.id}`}
                  viewTransition
                  className={cn(
                    "flex items-center gap-2 py-2 pr-3 text-sm border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-accent/40 transition-colors no-underline text-inherit",
                    viewState.groupBy !== "none" ? "pl-1" : "pl-3",
                    activePreviewId === goal.id && "bg-accent/30",
                  )}
                  onMouseEnter={() => handleRowHover(goal.id)}
                  onMouseLeave={() => handleRowHover(null)}
                >
                  {viewState.groupBy !== "none" && <div className="w-3.5 shrink-0 hidden sm:block" />}
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
                    <span style={{ viewTransitionName: `entity-status-${goal.id}` } as React.CSSProperties}>
                      <StatusBadge status={goal.status} />
                    </span>
                  </div>
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))
      }
    </div>
    </ListPreviewLayout>
  );
}
