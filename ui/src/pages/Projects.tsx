import { useEffect, useMemo, useState, useCallback, useRef, useDeferredValue } from "react";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { projectStatusLabel, formatLabel } from "../lib/labels";
import { formatDate, cn, projectUrl } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { PageSkeleton } from "../components/PageSkeleton";
import { ListPreviewLayout } from "../components/ListPreviewLayout";
import { ProjectPreview } from "../components/ProjectPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Hexagon, Plus, Filter, ArrowUpDown, Layers, Check, X, ChevronRight, Search } from "lucide-react";
import type { Project } from "@substaff/shared";

/* ── Helpers ── */

const projectStatusOrder = ["in_progress", "planned", "backlog", "completed", "cancelled"];

function statusLabel(status: string): string {
  return projectStatusLabel[status] ?? formatLabel(status);
}

/* ── View state ── */

type ProjectViewState = {
  statuses: string[];
  sortField: "status" | "name" | "created" | "updated" | "targetDate";
  sortDir: "asc" | "desc";
  groupBy: "status" | "none";
  collapsedGroups: string[];
};

const defaultViewState: ProjectViewState = {
  statuses: [],
  sortField: "updated",
  sortDir: "desc",
  groupBy: "none",
  collapsedGroups: [],
};

const quickFilterPresets = [
  { label: "All", statuses: [] as string[] },
  { label: "Active", statuses: ["in_progress", "planned"] },
  { label: "Later", statuses: ["backlog"] },
  { label: "Done", statuses: ["completed", "cancelled"] },
];

function getViewState(key: string): ProjectViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaultViewState, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultViewState };
}

function saveViewState(key: string, state: ProjectViewState) {
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

function applyFilters(projects: Project[], state: ProjectViewState): Project[] {
  let result = projects;
  if (state.statuses.length > 0) result = result.filter((p) => state.statuses.includes(p.status));
  return result;
}

function sortProjects(projects: Project[], state: ProjectViewState): Project[] {
  const sorted = [...projects];
  const dir = state.sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (state.sortField) {
      case "status":
        return dir * (projectStatusOrder.indexOf(a.status) - projectStatusOrder.indexOf(b.status));
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "created":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "updated":
        return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      case "targetDate": {
        const aDate = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
        const bDate = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
        return dir * (aDate - bDate);
      }
      default:
        return 0;
    }
  });
  return sorted;
}

function countActiveFilters(state: ProjectViewState): number {
  return state.statuses.length > 0 ? 1 : 0;
}

function groupByStatus(projects: Project[]): Record<string, Project[]> {
  const groups: Record<string, Project[]> = {};
  for (const project of projects) {
    if (!groups[project.status]) groups[project.status] = [];
    groups[project.status]!.push(project);
  }
  return groups;
}

/* ── Component ── */

export function Projects() {
  const { selectedCompanyId } = useCompany();
  const { openNewProject } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Projects" }]);
  }, [setBreadcrumbs]);

  const viewStateKey = "substaff:projects-view";
  const scopedKey = selectedCompanyId ? `${viewStateKey}:${selectedCompanyId}` : viewStateKey;

  const [viewState, setViewState] = useState<ProjectViewState>(() => getViewState(scopedKey));
  const [projectSearch, setProjectSearch] = useState("");
  const deferredSearch = useDeferredValue(projectSearch);

  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(getViewState(scopedKey));
    }
  }, [scopedKey]);

  const updateView = useCallback((patch: Partial<ProjectViewState>) => {
    setViewState((prev) => {
      const next = { ...prev, ...patch };
      saveViewState(scopedKey, next);
      return next;
    });
  }, [scopedKey]);

  const { data: projects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentName = useCallback((id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  }, [agents]);

  const visibleProjects = useMemo(
    () => (projects ?? []).filter((p: Project) => !p.archivedAt),
    [projects],
  );

  const filtered = useMemo(() => {
    let source = visibleProjects;
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      source = source.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    const filteredByControls = applyFilters(source, viewState);
    return sortProjects(filteredByControls, viewState);
  }, [visibleProjects, viewState, deferredSearch]);

  const activeFilterCount = countActiveFilters(viewState);

  const groupedContent = useMemo(() => {
    if (viewState.groupBy === "none") {
      return [{ key: "__all", label: null as string | null, items: filtered }];
    }
    const groups = groupByStatus(filtered);
    return projectStatusOrder
      .filter((s) => groups[s]?.length)
      .map((s) => ({ key: s, label: statusLabel(s), items: groups[s]! }));
  }, [filtered, viewState.groupBy]);

  // Preview panel state — always show a preview, falling back to first project
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [previewLocked, setPreviewLocked] = useState(false);
  const firstProjectId = filtered[0]?.id ?? null;
  const activePreviewId = hoveredProjectId ?? firstProjectId;
  const activeProject = useMemo(() => {
    if (!activePreviewId) return null;
    return visibleProjects.find((p) => p.id === activePreviewId) ?? null;
  }, [visibleProjects, activePreviewId]);

  const previewContent = activeProject ? (
    <ProjectPreview project={activeProject} agentName={agentName} />
  ) : null;

  const handleRowHover = useCallback((projectId: string | null) => {
    if (!previewLocked && projectId) setHoveredProjectId(projectId);
    if (projectId) {
      const p = projects?.find((x) => x.id === projectId);
      if (p) queryClient.setQueryData(
        [...queryKeys.projects.detail(p.urlKey || p.id), selectedCompanyId ?? null],
        p,
      );
    }
  }, [previewLocked, projects, queryClient, selectedCompanyId]);

  const handlePreviewClose = useCallback(() => {
    setHoveredProjectId(null);
    setPreviewLocked(false);
  }, []);

  const hoveredProjectRef = useRef(activeProject);
  if (activeProject) hoveredProjectRef.current = activeProject;

  const seedDetailCache = useCallback(() => {
    const p = hoveredProjectRef.current;
    if (!p) return;
    queryClient.setQueryData(
      [...queryKeys.projects.detail(p.urlKey || p.id), selectedCompanyId ?? null],
      p,
    );
  }, [queryClient, selectedCompanyId]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Hexagon} message="Select a workspace to view projects." />;
  }

  return (
    <ListPreviewLayout
      previewContent={previewContent}
      previewKey={activePreviewId}
      detailUrl={activeProject ? `${projectUrl(activeProject)}/issues` : null}
      onBeforeNavigate={seedDetailCache}
      onPreviewClose={handlePreviewClose}
      alwaysOpen
    >
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">Organize work into projects with deadlines and owners.</p>
      </div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button size="sm" variant="outline" onClick={openNewProject}>
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">New Project</span>
          </Button>
          <div className="relative w-48 sm:w-64 md:w-80">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-7 text-xs sm:text-sm"
              aria-label="Search projects"
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
            <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] p-0">
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
                    {projectStatusOrder.map((s) => (
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
                  ["name", "Name"],
                  ["targetDate", "Due Date"],
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
                <Layers className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
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
          icon={Hexagon}
          message="No projects match the current filters."
          action="New Project"
          onAction={openNewProject}
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
                  onClick={openNewProject}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            <CollapsibleContent>
              {group.items.map((project) => (
                <Link
                  key={project.id}
                  to={`${projectUrl(project)}/issues`}
                  viewTransition
                  className={cn(
                    "flex items-center gap-2 py-2 pr-3 text-sm border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-accent/40 transition-colors no-underline text-inherit",
                    viewState.groupBy !== "none" ? "pl-1" : "pl-3",
                    activePreviewId === project.id && "bg-accent/30",
                  )}
                  onMouseEnter={() => handleRowHover(project.id)}
                  onMouseLeave={() => handleRowHover(null)}
                >
                  {viewState.groupBy !== "none" && <div className="w-3.5 shrink-0 hidden sm:block" />}
                  <span
                    className="shrink-0 h-3.5 w-3.5 rounded-sm"
                    style={{ backgroundColor: project.color ?? "#6366f1" }}
                  />
                  <span
                    className="truncate flex-1 min-w-0"
                    style={{ viewTransitionName: `entity-title-${project.id}` } as React.CSSProperties}
                  >{project.name}</span>
                  {project.description && (
                    <span className="hidden lg:inline text-xs text-muted-foreground truncate max-w-[200px]">
                      {project.description}
                    </span>
                  )}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                    {project.leadAgentId && agentName(project.leadAgentId) && (
                      <div className="hidden sm:block">
                        <Identity name={agentName(project.leadAgentId)!} size="sm" />
                      </div>
                    )}
                    {project.targetDate && (
                      <span className="text-xs text-muted-foreground hidden sm:inline whitespace-nowrap">
                        {formatDate(project.targetDate)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground hidden lg:inline whitespace-nowrap">
                      {formatDate(project.createdAt)}
                    </span>
                    <span className="text-xs text-muted-foreground hidden lg:inline whitespace-nowrap">
                      {formatDate(project.updatedAt)}
                    </span>
                    <span style={{ viewTransitionName: `entity-status-${project.id}` } as React.CSSProperties}>
                      <StatusBadge status={project.status} />
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
