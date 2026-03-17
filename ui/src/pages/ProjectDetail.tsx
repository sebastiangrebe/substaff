import { useEffect, useMemo, useState, useRef, type CSSProperties } from "react";
import { useParams, useNavigate, useLocation, Navigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PROJECT_COLORS, isUuidLike, type ProjectProgress } from "@substaff/shared";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { assetsApi } from "../api/assets";

import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys, sharedQueries } from "../lib/queryKeys";
import { ProjectProperties } from "../components/ProjectProperties";
import { InlineEditor } from "../components/InlineEditor";
import { IssuesList } from "../components/IssuesList";
import { PageSkeleton } from "../components/PageSkeleton";
import { projectRouteRef } from "../lib/utils";
import { Target } from "lucide-react";
import { EntityAttachments } from "../components/EntityAttachments";

/* ── Color picker popover ── */

function ColorPicker({
  currentColor,
  onSelect,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="shrink-0 h-5 w-5 rounded-md cursor-pointer hover:ring-2 hover:ring-foreground/20 transition-[box-shadow]"
        style={{ backgroundColor: currentColor }}
        aria-label="Change project color"
      />
      {open && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-popover border border-border/50 rounded-xl shadow-lg z-50 w-max">
          <div className="grid grid-cols-5 gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-md cursor-pointer transition-[transform,box-shadow] duration-150 hover:scale-110 ${
                  color === currentColor
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "hover:ring-2 hover:ring-foreground/30"
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Issues list with inline mutation ── */

function ProjectIssuesList({ projectId, companyId, header }: { projectId: string; companyId: string; header?: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery(sharedQueries.liveRuns(companyId));

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      error={error as Error | null}
      agents={agents}
      liveIssueIds={liveIssueIds}
      projectId={projectId}
      viewStateKey={`substaff:project-view:${projectId}`}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
      header={header}
    />
  );
}

/* ── Progress section (card-interior only) ── */

function ProgressContent({ progress }: { progress: ProjectProgress }) {
  const { issues, completionPercent } = progress;
  const pct = Math.round(completionPercent);
  const barColor = pct >= 85 ? "bg-green-400" : pct >= 50 ? "bg-yellow-400" : "bg-blue-400";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {issues.done} of {issues.total} tasks complete
          </span>
          <span className="text-xs font-medium">{pct}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <CountChip label="Done" count={issues.done} colorClass="text-green-500" />
        <CountChip label="In Progress" count={issues.inProgress} colorClass="text-blue-500" />
        <CountChip label="Blocked" count={issues.blocked} colorClass="text-red-500" />
        <CountChip label="Open" count={issues.open} colorClass="text-muted-foreground" />
      </div>
    </div>
  );
}

function CountChip({ label, count, colorClass }: { label: string; count: number; colorClass: string }) {
  return (
    <div className="text-center rounded-lg bg-muted/30 py-2">
      <p className={`text-lg font-bold ${colorClass}`}>{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ── Main project page ── */

export function ProjectDetail() {
  const { companyPrefix, projectId, filter } = useParams<{
    companyPrefix?: string;
    projectId: string;
    filter?: string;
  }>();
  const { companies, selectedCompanyId } = useCompany();

  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const routeProjectRef = projectId ?? "";
  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix)?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? undefined;
  const canFetchProject = routeProjectRef.length > 0 && (isUuidLike(routeProjectRef) || Boolean(lookupCompanyId));

  // Check if route points to /issues sub-path
  const isIssuesRoute = useMemo(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    const projectsIdx = segments.indexOf("projects");
    if (projectsIdx === -1 || segments[projectsIdx + 1] !== routeProjectRef) return false;
    return segments[projectsIdx + 2] === "issues";
  }, [location.pathname, routeProjectRef]);

  const { data: project, isLoading, error } = useQuery({
    queryKey: [...queryKeys.projects.detail(routeProjectRef), lookupCompanyId ?? null],
    queryFn: () => projectsApi.get(routeProjectRef, lookupCompanyId),
    enabled: canFetchProject,
  });
  const canonicalProjectRef = project ? projectRouteRef(project) : routeProjectRef;
  const projectLookupRef = project?.id ?? routeProjectRef;
  const resolvedCompanyId = project?.companyId ?? selectedCompanyId;

  const { data: progress } = useQuery({
    queryKey: queryKeys.projects.progress(projectLookupRef),
    queryFn: () => projectsApi.progress(projectLookupRef, resolvedCompanyId ?? undefined),
    enabled: !!projectLookupRef && !!resolvedCompanyId,
  });

  useEffect(() => {
    if (!project?.companyId || project.companyId === selectedCompanyId) return;
    navigate("/projects", { replace: true });
  }, [project?.companyId, selectedCompanyId, navigate]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
    if (resolvedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
    }
  };

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: invalidateProject,
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(resolvedCompanyId, file, `projects/${projectLookupRef || "draft"}`);
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/projects" },
      { label: project?.name ?? routeProjectRef ?? "Project" },
    ]);
  }, [setBreadcrumbs, project, routeProjectRef]);

  // Canonical URL redirect
  useEffect(() => {
    if (!project) return;
    if (routeProjectRef === canonicalProjectRef) return;
    if (isIssuesRoute) {
      if (filter) {
        navigate(`/projects/${canonicalProjectRef}/issues/${filter}`, { replace: true });
        return;
      }
      navigate(`/projects/${canonicalProjectRef}/issues`, { replace: true });
      return;
    }
    navigate(`/projects/${canonicalProjectRef}`, { replace: true });
  }, [project, routeProjectRef, canonicalProjectRef, isIssuesRoute, filter, navigate]);

  // Redirect bare /projects/:id to /projects/:id/issues
  if (routeProjectRef && !isIssuesRoute) {
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!project) return null;

  const projectHeader = (
    <>
      {/* ── Hero header card ─────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-6">
        <div className="px-5 pt-5 pb-4 space-y-3">
          {/* Title row: color + title */}
          <div className="flex items-center gap-2 min-w-0">
            <ColorPicker
              currentColor={project.color ?? "#6366f1"}
              onSelect={(color) => updateProject.mutate({ color })}
            />
            <div className="flex-1 min-w-0" style={{ viewTransitionName: `entity-title-${project.id}` } as CSSProperties}>
              <InlineEditor
                value={project.name}
                onSave={(name) => updateProject.mutate({ name })}
                as="h2"
                className="text-xl font-bold tracking-tight"
              />
            </div>
          </div>

          {/* Description */}
          <InlineEditor
            value={project.description ?? ""}
            onSave={(description) => updateProject.mutate({ description })}
            as="p"
            className="text-sm text-muted-foreground leading-relaxed"
            placeholder="Add a description..."
            multiline
            imageUploadHandler={async (file) => {
              const asset = await uploadImage.mutateAsync(file);
              return asset.contentPath;
            }}
          />
        </div>

        {/* Inline properties */}
        <div className="border-t border-border/40 px-5 py-4">
          <ProjectProperties
            project={project}
            onUpdate={(data) => updateProject.mutate(data)}
          />
        </div>
      </div>

      {/* ── Attachments ── */}
      {project.id && resolvedCompanyId && (
        <EntityAttachments companyId={resolvedCompanyId} linkType="project" linkId={project.id} />
      )}

      {/* ── Progress ── */}
      {progress && progress.issues.total > 0 && (
        <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progress</span>
          </div>
          <div className="px-4 py-4">
            <ProgressContent progress={progress} />
          </div>
        </div>
      )}

    </>
  );

  return (
    <div>
      {project.id && resolvedCompanyId ? (
        <ProjectIssuesList projectId={project.id} companyId={resolvedCompanyId} header={projectHeader} />
      ) : (
        projectHeader
      )}
    </div>
  );
}
