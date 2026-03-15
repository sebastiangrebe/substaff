import { useState } from "react";
import { Link } from "@/lib/router";
import type { Issue } from "@substaff/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { formatDate, cn, projectUrl } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { User, Hexagon, ArrowUpRight, Tag, Plus, Trash2, Search, Check } from "lucide-react";
import { AgentIcon } from "./AgentIconPicker";
import { BudgetEditor } from "./BudgetEditor";

interface IssuePropertiesProps {
  issue: Issue;
  onUpdate: (data: Record<string, unknown>) => void;
  inline?: boolean;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">{children}</div>
    </div>
  );
}

function PropertyCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

/** Renders a Popover on desktop, or an inline collapsible section on mobile (inline mode). */
function PropertyPicker({
  inline,
  label,
  hideLabel,
  open,
  onOpenChange,
  triggerContent,
  triggerClassName,
  popoverClassName,
  popoverAlign = "end",
  extra,
  children,
}: {
  inline?: boolean;
  label: string;
  /** When true, skip the label wrapper (use when already inside a PropertyCell) */
  hideLabel?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerContent: React.ReactNode;
  triggerClassName?: string;
  popoverClassName?: string;
  popoverAlign?: "start" | "center" | "end";
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const btnCn = cn(
    "inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors",
    triggerClassName,
  );

  if (inline && hideLabel) {
    // Inside a PropertyCell in the grid — use Popover
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button className={btnCn}>{triggerContent}</button>
        </PopoverTrigger>
        {extra}
        <PopoverContent className={cn("p-1", popoverClassName)} align={popoverAlign} collisionPadding={16}>
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  if (inline) {
    const dropdown = open ? (
      <div className={cn("rounded-md border border-border bg-popover p-1 mb-2", popoverClassName)}>
        {children}
      </div>
    ) : null;

    return (
      <div>
        <PropertyRow label={label}>
          <button className={btnCn} onClick={() => onOpenChange(!open)}>
            {triggerContent}
          </button>
          {extra}
        </PropertyRow>
        {dropdown}
      </div>
    );
  }

  return (
    <PropertyRow label={label}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button className={btnCn}>{triggerContent}</button>
        </PopoverTrigger>
        <PopoverContent className={cn("p-1", popoverClassName)} align={popoverAlign} collisionPadding={16}>
          {children}
        </PopoverContent>
      </Popover>
      {extra}
    </PropertyRow>
  );
}

export function IssueProperties({ issue, onUpdate, inline }: IssuePropertiesProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const companyId = issue.companyId ?? selectedCompanyId;
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId;

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId!),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId!),
    queryFn: () => projectsApi.list(companyId!),
    enabled: !!companyId,
  });
  const { orderedProjects } = useProjectOrder({
    projects: projects ?? [],
    companyId,
    userId: currentUserId,
  });

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(companyId!),
    queryFn: () => issuesApi.listLabels(companyId!),
    enabled: !!companyId,
  });

  const createLabel = useMutation({
    mutationFn: (data: { name: string; color: string }) => issuesApi.createLabel(companyId!, data),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      onUpdate({ labelIds: [...(issue.labelIds ?? []), created.id] });
      setNewLabelName("");
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId!) });
    },
  });

  const deleteLabel = useMutation({
    mutationFn: (labelId: string) => issuesApi.deleteLabel(labelId),
    onMutate: async (labelId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      const previousLabels = queryClient.getQueryData(queryKeys.issues.labels(companyId!));
      queryClient.setQueryData(queryKeys.issues.labels(companyId!), (old: { id: string }[] | undefined) =>
        old ? old.filter((l) => l.id !== labelId) : old,
      );
      // Also remove from issue's labelIds if present
      const currentIds = issue.labelIds ?? [];
      if (currentIds.includes(labelId)) {
        onUpdate({ labelIds: currentIds.filter((id) => id !== labelId) });
      }
      return { previousLabels };
    },
    onError: (_err, _labelId, context) => {
      if (context?.previousLabels) {
        queryClient.setQueryData(queryKeys.issues.labels(companyId!), context.previousLabels);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
    },
  });

  const toggleLabel = (labelId: string) => {
    const ids = issue.labelIds ?? [];
    const next = ids.includes(labelId)
      ? ids.filter((id) => id !== labelId)
      : [...ids, labelId];
    onUpdate({ labelIds: next });
  };

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    const agent = agents.find((a) => a.id === id);
    return agent?.name ?? id.slice(0, 8);
  };

  const projectName = (id: string | null) => {
    if (!id) return id?.slice(0, 8) ?? "None";
    const project = orderedProjects.find((p) => p.id === id);
    return project?.name ?? id.slice(0, 8);
  };
  const projectLink = (id: string | null) => {
    if (!id) return null;
    const project = projects?.find((p) => p.id === id) ?? null;
    return project ? projectUrl(project) : `/projects/${id}`;
  };

  const assignee = issue.assigneeAgentId
    ? agents?.find((a) => a.id === issue.assigneeAgentId)
    : null;
  const userLabel = (userId: string | null | undefined) =>
    userId
      ? userId === "local-board"
        ? "Board"
        : currentUserId && userId === currentUserId
          ? "Me"
          : userId.slice(0, 5)
      : null;
  const assigneeUserLabel = userLabel(issue.assigneeUserId);
  const creatorUserLabel = userLabel(issue.createdByUserId);

  const labelsTrigger = (issue.labels ?? []).length > 0 ? (
    <div className="flex items-center gap-1 flex-wrap">
      {(issue.labels ?? []).slice(0, 3).map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
          style={{
            borderColor: label.color,
            backgroundColor: `${label.color}22`,
            color: label.color,
          }}
        >
          {label.name}
        </span>
      ))}
      {(issue.labels ?? []).length > 3 && (
        <span className="text-xs text-muted-foreground">+{(issue.labels ?? []).length - 3}</span>
      )}
    </div>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground">No labels</span>
    </span>
  );

  const labelPresetColors = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#6b7280",
  ];

  const filteredLabels = (labels ?? []).filter((label) => {
    if (!labelSearch.trim()) return true;
    return label.name.toLowerCase().includes(labelSearch.toLowerCase());
  });

  const labelsContent = (
    <div className="w-full">
      {/* Search */}
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
        <Search className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        <input
          className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground/50"
          placeholder="Search labels..."
          value={labelSearch}
          onChange={(e) => setLabelSearch(e.target.value)}
          autoFocus={!inline}
        />
      </div>

      {/* Label list */}
      <div className="max-h-44 overflow-y-auto overscroll-contain py-1">
        {filteredLabels.length === 0 && (
          <div className="flex flex-col items-center justify-center py-5 px-3 text-center">
            <Tag className="h-7 w-7 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground/70">
              {labelSearch.trim() ? "No matching labels" : "No labels yet"}
            </p>
            <p className="text-[11px] text-muted-foreground/40 mt-0.5">
              {labelSearch.trim() ? "Try a different search" : "Create one below to get started"}
            </p>
          </div>
        )}
        {filteredLabels.map((label) => {
          const selected = (issue.labelIds ?? []).includes(label.id);
          return (
            <div key={label.id} className="group flex items-center gap-0.5 px-1">
              <button
                className={cn(
                  "flex items-center gap-2 flex-1 px-2 py-1.5 text-xs rounded-md hover:bg-accent/50 text-left transition-colors",
                  selected && "bg-accent"
                )}
                onClick={() => toggleLabel(label.id)}
              >
                <span
                  className="h-3 w-3 rounded shrink-0 border border-black/10"
                  style={{ backgroundColor: label.color }}
                />
                <span className="truncate flex-1">{label.name}</span>
                {selected && <Check className="h-3 w-3 text-muted-foreground shrink-0" />}
              </button>
              <button
                type="button"
                className="p-1 text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive rounded transition-colors"
                onClick={() => deleteLabel.mutate(label.id)}
                title={`Delete ${label.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Create label */}
      <div className="border-t border-border px-2.5 pt-2 pb-1.5 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-6 w-6 rounded shrink-0 border border-border hover:ring-2 hover:ring-ring/30 transition-shadow"
            style={{ backgroundColor: newLabelColor }}
            onClick={() => {
              const idx = labelPresetColors.indexOf(newLabelColor);
              setNewLabelColor(labelPresetColors[(idx + 1) % labelPresetColors.length]);
            }}
            title="Click to cycle color"
          />
          <input
            className="flex-1 px-2 py-1 text-xs bg-muted/50 rounded-md outline-none border border-transparent focus:border-border placeholder:text-muted-foreground/50 transition-colors"
            placeholder="Label name"
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLabelName.trim()) {
                createLabel.mutate({ name: newLabelName.trim(), color: newLabelColor });
              }
            }}
          />
        </div>
        {/* Color presets */}
        <div className="flex items-center gap-1">
          {labelPresetColors.map((color) => (
            <button
              key={color}
              type="button"
              className={cn(
                "h-4 w-4 rounded-full transition-all",
                newLabelColor === color
                  ? "ring-2 ring-ring ring-offset-1 ring-offset-background scale-110"
                  : "hover:scale-110"
              )}
              style={{ backgroundColor: color }}
              onClick={() => setNewLabelColor(color)}
            />
          ))}
        </div>
        <button
          className={cn(
            "flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-xs font-medium rounded-md transition-colors",
            newLabelName.trim()
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
          disabled={!newLabelName.trim() || createLabel.isPending}
          onClick={() =>
            createLabel.mutate({
              name: newLabelName.trim(),
              color: newLabelColor,
            })
          }
        >
          <Plus className="h-3 w-3" />
          {createLabel.isPending ? "Creating…" : "Create label"}
        </button>
      </div>
    </div>
  );

  const assigneeTrigger = assignee ? (
    <Identity name={assignee.name} size="sm" />
  ) : assigneeUserLabel ? (
    <>
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm">{assigneeUserLabel}</span>
    </>
  ) : (
    <>
      <User className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Unassigned</span>
    </>
  );

  const assigneeContent = (
    <>
      <input
        className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
        placeholder="Search assignees..."
        value={assigneeSearch}
        onChange={(e) => setAssigneeSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="max-h-48 overflow-y-auto overscroll-contain">
        <button
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
            !issue.assigneeAgentId && !issue.assigneeUserId && "bg-accent"
          )}
          onClick={() => { onUpdate({ assigneeAgentId: null, assigneeUserId: null }); setAssigneeOpen(false); }}
        >
          No assignee
        </button>
        {issue.createdByUserId && (
          <button
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
              issue.assigneeUserId === issue.createdByUserId && "bg-accent",
            )}
            onClick={() => {
              onUpdate({ assigneeAgentId: null, assigneeUserId: issue.createdByUserId });
              setAssigneeOpen(false);
            }}
          >
            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            {creatorUserLabel ? `Assign to ${creatorUserLabel === "Me" ? "me" : creatorUserLabel}` : "Assign to requester"}
          </button>
        )}
        {(agents ?? [])
          .filter((a) => a.status !== "terminated")
          .filter((a) => {
            if (!assigneeSearch.trim()) return true;
            const q = assigneeSearch.toLowerCase();
            return a.name.toLowerCase().includes(q);
          })
          .map((a) => (
          <button
            key={a.id}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
              a.id === issue.assigneeAgentId && "bg-accent"
            )}
            onClick={() => { onUpdate({ assigneeAgentId: a.id, assigneeUserId: null }); setAssigneeOpen(false); }}
          >
            <AgentIcon icon={a.icon} className="shrink-0 h-3 w-3 text-muted-foreground" />
            {a.name}
          </button>
        ))}
      </div>
    </>
  );

  const projectTrigger = issue.projectId ? (
    <>
      <span
        className="shrink-0 h-3 w-3 rounded-sm"
        style={{ backgroundColor: orderedProjects.find((p) => p.id === issue.projectId)?.color ?? "#6366f1" }}
      />
      <span className="text-sm truncate">{projectName(issue.projectId)}</span>
    </>
  ) : (
    <>
      <Hexagon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">No project</span>
    </>
  );

  const projectContent = (
    <>
      <input
        className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
        placeholder="Search projects..."
        value={projectSearch}
        onChange={(e) => setProjectSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="max-h-48 overflow-y-auto overscroll-contain">
        <button
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap",
            !issue.projectId && "bg-accent"
          )}
          onClick={() => { onUpdate({ projectId: null }); setProjectOpen(false); }}
        >
          No project
        </button>
        {orderedProjects
          .filter((p) => {
            if (!projectSearch.trim()) return true;
            const q = projectSearch.toLowerCase();
            return p.name.toLowerCase().includes(q);
          })
          .map((p) => (
          <button
            key={p.id}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap",
              p.id === issue.projectId && "bg-accent"
            )}
            onClick={() => { onUpdate({ projectId: p.id }); setProjectOpen(false); }}
          >
            <span
              className="shrink-0 h-3 w-3 rounded-sm"
              style={{ backgroundColor: p.color ?? "#6366f1" }}
            />
            {p.name}
          </button>
        ))}
      </div>
    </>
  );

  if (inline) {
    // Collect date cells (only render those that exist)
    const dateCells: { label: string; value: string }[] = [];
    if (issue.startedAt) dateCells.push({ label: "Started", value: formatDate(issue.startedAt) });
    if (issue.completedAt) dateCells.push({ label: "Completed", value: formatDate(issue.completedAt) });
    dateCells.push({ label: "Created", value: formatDate(issue.createdAt) });
    dateCells.push({ label: "Updated", value: timeAgo(issue.updatedAt) });

    return (
      <div className="grid grid-cols-4 gap-x-4 gap-y-3">
        {/* Row 1: Status, Priority, Assignee, Project */}
        <PropertyCell label="Status">
          <StatusIcon status={issue.status} onChange={(status) => onUpdate({ status })} showLabel />
        </PropertyCell>
        <PropertyCell label="Priority">
          <PriorityIcon priority={issue.priority} onChange={(priority) => onUpdate({ priority })} showLabel />
        </PropertyCell>
        <PropertyCell label="Assignee">
          <PropertyPicker
            inline hideLabel label="Assignee"
            open={assigneeOpen}
            onOpenChange={(open) => { setAssigneeOpen(open); if (!open) setAssigneeSearch(""); }}
            triggerContent={assigneeTrigger}
            popoverClassName="w-52"
            extra={issue.assigneeAgentId ? (
              <Link to={`/agents/${issue.assigneeAgentId}`} className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}><ArrowUpRight className="h-3 w-3" /></Link>
            ) : undefined}
          >{assigneeContent}</PropertyPicker>
        </PropertyCell>
        <PropertyCell label="Project">
          <PropertyPicker
            inline hideLabel label="Project"
            open={projectOpen}
            onOpenChange={(open) => { setProjectOpen(open); if (!open) setProjectSearch(""); }}
            triggerContent={projectTrigger}
            triggerClassName="min-w-0"
            popoverClassName="w-fit min-w-[11rem]"
            extra={issue.projectId ? (
              <Link to={projectLink(issue.projectId)!} className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}><ArrowUpRight className="h-3 w-3" /></Link>
            ) : undefined}
          >{projectContent}</PropertyPicker>
        </PropertyCell>

        {/* Row 2: Labels + Budgets (+ optional Parent/Depth) */}
        <PropertyCell label="Labels">
          <PropertyPicker
            inline hideLabel label="Labels"
            open={labelsOpen}
            onOpenChange={(open) => { setLabelsOpen(open); if (!open) setLabelSearch(""); }}
            triggerContent={labelsTrigger}
            triggerClassName="min-w-0 max-w-full"
            popoverClassName="w-64"
          >{labelsContent}</PropertyPicker>
        </PropertyCell>
        <div className="col-span-2">
          <BudgetEditor
            budgetMonthlyCents={issue.budgetMonthlyCents}
            platformSpentMonthlyCents={issue.platformSpentMonthlyCents}
            budgetTotalCents={issue.budgetTotalCents}
            platformSpentTotalCents={issue.platformSpentTotalCents}
            onUpdateMonthly={(cents) => onUpdate({ budgetMonthlyCents: cents })}
            onUpdateTotal={(cents) => onUpdate({ budgetTotalCents: cents })}
            emphasizeTotal
          />
        </div>
        {issue.parentId && (
          <PropertyCell label="Parent">
            <Link to={`/issues/${issue.ancestors?.[0]?.identifier ?? issue.parentId}`} className="text-sm hover:underline truncate">
              {issue.ancestors?.[0]?.title ?? issue.parentId.slice(0, 8)}
            </Link>
          </PropertyCell>
        )}
        {issue.requestDepth > 0 && (
          <PropertyCell label="Depth">
            <span className="text-sm font-mono">{issue.requestDepth}</span>
          </PropertyCell>
        )}

        {/* Separator spanning full row */}
        <div className="col-span-4"><Separator /></div>

        {/* Row 3: Dates */}
        {dateCells.map((d) => (
          <PropertyCell key={d.label} label={d.label}>
            <span className="text-sm">{d.value}</span>
          </PropertyCell>
        ))}
      </div>
    );
  }

  // Non-inline (sidebar panel) layout
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PropertyRow label="Status">
          <StatusIcon
            status={issue.status}
            onChange={(status) => onUpdate({ status })}
            showLabel
          />
        </PropertyRow>

        <PropertyRow label="Priority">
          <PriorityIcon
            priority={issue.priority}
            onChange={(priority) => onUpdate({ priority })}
            showLabel
          />
        </PropertyRow>

        <PropertyPicker
          label="Labels"
          open={labelsOpen}
          onOpenChange={(open) => { setLabelsOpen(open); if (!open) setLabelSearch(""); }}
          triggerContent={labelsTrigger}
          triggerClassName="min-w-0 max-w-full"
          popoverClassName="w-64"
        >
          {labelsContent}
        </PropertyPicker>

        <PropertyPicker
          label="Assignee"
          open={assigneeOpen}
          onOpenChange={(open) => { setAssigneeOpen(open); if (!open) setAssigneeSearch(""); }}
          triggerContent={assigneeTrigger}
          popoverClassName="w-52"
          extra={issue.assigneeAgentId ? (
            <Link
              to={`/agents/${issue.assigneeAgentId}`}
              className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : undefined}
        >
          {assigneeContent}
        </PropertyPicker>

        <PropertyPicker
          label="Project"
          open={projectOpen}
          onOpenChange={(open) => { setProjectOpen(open); if (!open) setProjectSearch(""); }}
          triggerContent={projectTrigger}
          triggerClassName="min-w-0 max-w-full"
          popoverClassName="w-fit min-w-[11rem]"
          extra={issue.projectId ? (
            <Link
              to={projectLink(issue.projectId)!}
              className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : undefined}
        >
          {projectContent}
        </PropertyPicker>

        {issue.parentId && (
          <PropertyRow label="Parent">
            <Link
              to={`/issues/${issue.ancestors?.[0]?.identifier ?? issue.parentId}`}
              className="text-sm hover:underline"
            >
              {issue.ancestors?.[0]?.title ?? issue.parentId.slice(0, 8)}
            </Link>
          </PropertyRow>
        )}

        {issue.requestDepth > 0 && (
          <PropertyRow label="Depth">
            <span className="text-sm font-mono">{issue.requestDepth}</span>
          </PropertyRow>
        )}
      </div>

      <Separator />

      <BudgetEditor
        budgetMonthlyCents={issue.budgetMonthlyCents}
        platformSpentMonthlyCents={issue.platformSpentMonthlyCents}
        budgetTotalCents={issue.budgetTotalCents}
        platformSpentTotalCents={issue.platformSpentTotalCents}
        onUpdateMonthly={(cents) => onUpdate({ budgetMonthlyCents: cents })}
        onUpdateTotal={(cents) => onUpdate({ budgetTotalCents: cents })}
        emphasizeTotal
      />

      <Separator />

      <div className="space-y-1">
        {issue.startedAt && (
          <PropertyRow label="Started">
            <span className="text-sm">{formatDate(issue.startedAt)}</span>
          </PropertyRow>
        )}
        {issue.completedAt && (
          <PropertyRow label="Completed">
            <span className="text-sm">{formatDate(issue.completedAt)}</span>
          </PropertyRow>
        )}
        <PropertyRow label="Created">
          <span className="text-sm">{formatDate(issue.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label="Updated">
          <span className="text-sm">{timeAgo(issue.updatedAt)}</span>
        </PropertyRow>
      </div>
    </div>
  );
}
