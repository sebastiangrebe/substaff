import { useEffect, useMemo, useState, useCallback, useRef, useDeferredValue } from "react";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { strategyApi } from "../api/strategy";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { formatLabel } from "../lib/labels";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { PageSkeleton } from "../components/PageSkeleton";
import { ListPreviewLayout } from "../components/ListPreviewLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Crosshair,
  Plus,
  Filter,
  ArrowUpDown,
  Check,
  X,
  ChevronRight,
  Search,
  Target,
  TrendingUp,
  Bot,
} from "lucide-react";
import { FeatureInfoSection } from "../components/FeatureInfoSection";
import { cn, formatDate } from "../lib/utils";
import type { Objective } from "@substaff/shared";

/* ── Helpers ── */

type ObjectiveSummary = Objective & { keyResultCount: number; overallProgressPercent: number };

const objectiveStatusOrder = ["active", "draft", "achieved", "stalled", "cancelled"];

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    active: "Active",
    achieved: "Achieved",
    cancelled: "Cancelled",
    stalled: "Stalled",
  };
  return labels[status] ?? formatLabel(status);
}

/* ── View state ── */

type StrategyViewState = {
  statuses: string[];
  timePeriods: string[];
  sortField: "status" | "title" | "created" | "updated";
  sortDir: "asc" | "desc";
  groupBy: "status" | "none";
  collapsedGroups: string[];
};

const defaultViewState: StrategyViewState = {
  statuses: [],
  timePeriods: [],
  sortField: "updated",
  sortDir: "desc",
  groupBy: "none",
  collapsedGroups: [],
};

const quickFilterPresets = [
  { label: "All", statuses: [] as string[] },
  { label: "Active", statuses: ["active"] },
  { label: "Draft", statuses: ["draft"] },
  { label: "Achieved", statuses: ["achieved"] },
];

function getViewState(key: string): StrategyViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaultViewState, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultViewState };
}

function saveViewState(key: string, state: StrategyViewState) {
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

function applyFilters(objectives: ObjectiveSummary[], state: StrategyViewState): ObjectiveSummary[] {
  let result = objectives;
  if (state.statuses.length > 0) result = result.filter((o) => state.statuses.includes(o.status));
  if (state.timePeriods.length > 0) result = result.filter((o) => state.timePeriods.includes(o.timePeriod));
  return result;
}

function sortObjectives(objectives: ObjectiveSummary[], state: StrategyViewState): ObjectiveSummary[] {
  const sorted = [...objectives];
  const dir = state.sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (state.sortField) {
      case "status":
        return dir * (objectiveStatusOrder.indexOf(a.status) - objectiveStatusOrder.indexOf(b.status));
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

function groupByField(objectives: ObjectiveSummary[], field: string): Record<string, ObjectiveSummary[]> {
  const groups: Record<string, ObjectiveSummary[]> = {};
  for (const obj of objectives) {
    const key = field === "status" ? obj.status : "all";
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(obj);
  }
  return groups;
}

/* ── Progress bar ── */

function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const color =
    percent >= 80 ? "bg-green-500" : percent >= 50 ? "bg-yellow-400" : percent >= 20 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className={cn("h-1.5 w-16 bg-muted/50 rounded-full overflow-hidden", className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${percent}%` }} />
    </div>
  );
}

/* ── Objective preview ── */

function ObjectivePreview({
  objective,
  agentName,
}: {
  objective: ObjectiveSummary;
  agentName: (id: string | null) => string | null;
}) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="font-semibold text-lg">{objective.title}</h3>
        {objective.description && (
          <p className="mt-1 text-sm text-muted-foreground">{objective.description}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <StatusBadge status={objective.status} />
        <span className="text-muted-foreground">{statusLabel(objective.timePeriod)}</span>
        {objective.ownerAgentId && agentName(objective.ownerAgentId) && (
          <Identity name={agentName(objective.ownerAgentId)!} size="sm" />
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Overall progress</span>
          <span>{objective.overallProgressPercent}%</span>
        </div>
        <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              objective.overallProgressPercent >= 80
                ? "bg-green-500"
                : objective.overallProgressPercent >= 50
                  ? "bg-yellow-400"
                  : "bg-orange-400",
            )}
            style={{ width: `${objective.overallProgressPercent}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {objective.keyResultCount} key result{objective.keyResultCount !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

/* ── New Objective Dialog ── */

function NewObjectiveDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timePeriod, setTimePeriod] = useState("quarterly");
  const [status, setStatus] = useState("draft");

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => strategyApi.createObjective(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.summary(companyId) });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setTimePeriod("quarterly");
      setStatus("draft");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Objective</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="obj-title">Title</Label>
            <Input
              id="obj-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Increase monthly active users by 50%"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="obj-desc">Description</Label>
            <Textarea
              id="obj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the objective..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Time period</Label>
              <Select value={timePeriod} onValueChange={setTimePeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                title: title.trim(),
                description: description.trim() || null,
                timePeriod,
                status,
              })
            }
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main component ── */

export function Strategy() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Strategy" }]);
  }, [setBreadcrumbs]);

  const viewStateKey = "substaff:strategy-view";
  const scopedKey = selectedCompanyId ? `${viewStateKey}:${selectedCompanyId}` : viewStateKey;

  const [viewState, setViewState] = useState<StrategyViewState>(() => getViewState(scopedKey));
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);

  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(getViewState(scopedKey));
    }
  }, [scopedKey]);

  const updateView = useCallback(
    (patch: Partial<StrategyViewState>) => {
      setViewState((prev) => {
        const next = { ...prev, ...patch };
        saveViewState(scopedKey, next);
        return next;
      });
    },
    [scopedKey],
  );

  const { data: objectives, isLoading, error } = useQuery({
    queryKey: queryKeys.strategy.summary(selectedCompanyId!),
    queryFn: () => strategyApi.listObjectivesSummary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const filtered = useMemo(() => {
    let source = (objectives ?? []) as ObjectiveSummary[];
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      source = source.filter(
        (o) => o.title.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q),
      );
    }
    const filteredByControls = applyFilters(source, viewState);
    return sortObjectives(filteredByControls, viewState);
  }, [objectives, viewState, deferredSearch]);

  const activeFilterCount = (viewState.statuses.length > 0 ? 1 : 0) + (viewState.timePeriods.length > 0 ? 1 : 0);

  const groupedContent = useMemo(() => {
    if (viewState.groupBy === "none") {
      return [{ key: "__all", label: null as string | null, items: filtered }];
    }
    const order = objectiveStatusOrder;
    const groups = groupByField(filtered, viewState.groupBy);
    return order
      .filter((k) => groups[k]?.length)
      .map((k) => ({ key: k, label: statusLabel(k), items: groups[k]! }));
  }, [filtered, viewState.groupBy]);

  const agentName = useCallback(
    (id: string | null) => {
      if (!id || !agents) return null;
      return agents.find((a) => a.id === id)?.name ?? null;
    },
    [agents],
  );

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const firstId = filtered[0]?.id ?? null;
  const activePreviewId = hoveredId ?? firstId;
  const activeObjective = useMemo(() => {
    if (!activePreviewId) return null;
    return filtered.find((o) => o.id === activePreviewId) ?? null;
  }, [filtered, activePreviewId]);

  const previewContent = activeObjective ? (
    <ObjectivePreview objective={activeObjective} agentName={agentName} />
  ) : null;

  const handleRowHover = useCallback(
    (id: string | null) => {
      if (id) setHoveredId(id);
    },
    [],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={Crosshair} message="Select a workspace to view strategy." />;
  }

  return (
    <>
      <NewObjectiveDialog open={dialogOpen} onOpenChange={setDialogOpen} companyId={selectedCompanyId} />
      <ListPreviewLayout
        previewContent={previewContent}
        previewKey={activePreviewId}
        detailUrl={activePreviewId ? `/strategy/${activePreviewId}` : null}
        onPreviewClose={() => setHoveredId(null)}
        alwaysOpen
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Strategy</h1>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Set objectives, track key results, and measure progress across your company.
            </p>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Button size="sm" className="h-8 px-3 text-xs" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Objective
              </Button>
              <div className="relative w-48 sm:w-64 md:w-80">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search objectives..."
                  className="h-8 pl-8 text-xs rounded-lg border-border/60 bg-muted/30 placeholder:text-muted-foreground/40"
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
                        : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:border-border",
                    )}
                  >
                    <Filter className="h-3 w-3" />
                    <span className="hidden sm:inline">
                      {activeFilterCount > 0 ? `Filter (${activeFilterCount})` : "Filter"}
                    </span>
                    {activeFilterCount > 0 && (
                      <X
                        className="h-3 w-3 -mr-0.5 hidden sm:block opacity-60 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateView({ statuses: [], timePeriods: [] });
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
                          onClick={() => updateView({ statuses: [], timePeriods: [] })}
                        >
                          Clear
                        </button>
                      )}
                    </div>

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

                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Status</span>
                      <div className="space-y-0.5">
                        {objectiveStatusOrder.map((s) => (
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
              icon={Crosshair}
              message="No objectives match the current filters."
              action="New Objective"
              onAction={() => setDialogOpen(true)}
            />
          )}

          {!isLoading &&
            filtered.length > 0 &&
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
                      <span className="text-sm font-semibold">{group.label}</span>
                    </CollapsibleTrigger>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ml-auto text-muted-foreground"
                      onClick={() => setDialogOpen(true)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <CollapsibleContent>
                  <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden shadow-xs">
                    {group.items.map((obj) => (
                      <Link
                        key={obj.id}
                        to={`/strategy/${obj.id}`}
                        viewTransition
                        className={cn(
                          "flex items-center gap-3 px-4 h-11 text-sm cursor-pointer hover:bg-accent/40 transition-colors no-underline text-inherit",
                          activePreviewId === obj.id && "bg-primary/5",
                        )}
                        onMouseEnter={() => handleRowHover(obj.id)}
                        onMouseLeave={() => handleRowHover(null)}
                      >
                        <Crosshair className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1 min-w-0">{obj.title}</span>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                          <ProgressBar percent={obj.overallProgressPercent} />
                          <span className="text-xs text-muted-foreground tabular-nums w-7 text-right">
                            {obj.overallProgressPercent}%
                          </span>
                          {obj.ownerAgentId && agentName(obj.ownerAgentId) && (
                            <div className="hidden sm:block">
                              <Identity name={agentName(obj.ownerAgentId)!} size="sm" />
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground hidden lg:inline whitespace-nowrap">
                            {formatDate(obj.updatedAt)}
                          </span>
                          <StatusBadge status={obj.status} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
        {!isLoading && (objectives ?? []).length < 5 && (
          <FeatureInfoSection
            title="How strategy works"
            subtitle="Strategy connects high-level objectives to measurable outcomes across your company."
            features={[
              {
                icon: Crosshair,
                title: "Set objectives (OKRs)",
                description:
                  "Define quarterly or annual objectives with clear outcomes. Each objective can have multiple key results that track measurable progress.",
              },
              {
                icon: TrendingUp,
                title: "Track key results & KPIs",
                description:
                  "Attach key results with targets and units. Report KPI entries over time to see trends, progress bars, and whether you're on track.",
              },
              {
                icon: Bot,
                title: "Strategist agents",
                description:
                  "Hire a strategist agent to automatically review metrics when idle. They analyze KR trends, identify gaps, and propose new objectives.",
              },
            ]}
          />
        )}

        </div>
      </ListPreviewLayout>
    </>
  );
}
