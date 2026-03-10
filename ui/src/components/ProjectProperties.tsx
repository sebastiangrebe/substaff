import { useState } from "react";
import { Link } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PROJECT_STATUSES, type Project } from "@substaff/shared";
import { StatusBadge } from "./StatusBadge";
import { formatDate, cn } from "../lib/utils";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Plus, X } from "lucide-react";

interface ProjectPropertiesProps {
  project: Project;
  onUpdate?: (data: Record<string, unknown>) => void;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

const editableClasses =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -ml-1.5 cursor-pointer transition-colors hover:bg-accent/50 border border-transparent hover:border-border";

function LeadPicker({
  agents,
  currentId,
  onChange,
}: {
  agents: { id: string; name: string }[];
  currentId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = currentId ? agents.find((a) => a.id === currentId) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(editableClasses, "text-sm")}>
          {current ? current.name : <span className="text-muted-foreground">None</span>}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <button
          className={cn(
            "flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors",
            !currentId && "bg-accent"
          )}
          onClick={() => { onChange(null); setOpen(false); }}
        >
          None
        </button>
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={cn(
              "flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors",
              agent.id === currentId && "bg-accent"
            )}
            onClick={() => { onChange(agent.id); setOpen(false); }}
          >
            {agent.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function ProjectProperties({ project, onUpdate }: ProjectPropertiesProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalSearch, setGoalSearch] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: allGoals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const linkedGoalIds = project.goalIds.length > 0
    ? project.goalIds
    : project.goalId
      ? [project.goalId]
      : [];

  const linkedGoals = project.goals.length > 0
    ? project.goals
    : linkedGoalIds.map((id) => ({
        id,
        title: allGoals?.find((g) => g.id === id)?.title ?? id.slice(0, 8),
      }));

  const availableGoals = (allGoals ?? []).filter((g) => !linkedGoalIds.includes(g.id));

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
    }
  };

  const removeGoal = (goalId: string) => {
    if (!onUpdate) return;
    onUpdate({ goalIds: linkedGoalIds.filter((id) => id !== goalId) });
  };

  const addGoal = (goalId: string) => {
    if (!onUpdate || linkedGoalIds.includes(goalId)) return;
    onUpdate({ goalIds: [...linkedGoalIds, goalId] });
    setGoalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-3">
        <PropertyRow label="Status">
          {onUpdate ? (
            <Popover open={statusOpen} onOpenChange={setStatusOpen}>
              <PopoverTrigger asChild>
                <button className={cn(editableClasses, "text-sm")}>
                  <StatusBadge status={project.status} />
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="start">
                {PROJECT_STATUSES.map((s) => (
                  <button
                    key={s}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 capitalize transition-colors",
                      s === project.status && "bg-accent"
                    )}
                    onClick={() => { onUpdate({ status: s }); setStatusOpen(false); }}
                  >
                    <StatusBadge status={s} />
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          ) : (
            <StatusBadge status={project.status} />
          )}
        </PropertyRow>
        <PropertyRow label="Lead">
          {onUpdate ? (
            <LeadPicker
              agents={agents ?? []}
              currentId={project.leadAgentId}
              onChange={(leadAgentId) => onUpdate({ leadAgentId })}
            />
          ) : project.leadAgentId ? (
            <span className="text-sm">
              {agents?.find((a) => a.id === project.leadAgentId)?.name ?? project.leadAgentId.slice(0, 8)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">None</span>
          )}
        </PropertyRow>
        {project.targetDate && (
          <PropertyRow label="Target Date">
            <span className="text-sm">{formatDate(project.targetDate)}</span>
          </PropertyRow>
        )}
        <PropertyRow label="Created">
          <span className="text-sm">{formatDate(project.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label="Updated">
          <span className="text-sm">{formatDate(project.updatedAt)}</span>
        </PropertyRow>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Goals</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {linkedGoals.length === 0 && (
            <span className="text-sm text-muted-foreground">None</span>
          )}
          {linkedGoals.map((goal) => (
            <span
              key={goal.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 h-8 text-sm"
            >
              <Link to={`/goals/${goal.id}`} className="hover:underline">
                {goal.title}
              </Link>
              {onUpdate && (
                <button
                  className="text-muted-foreground hover:text-foreground"
                  type="button"
                  onClick={() => removeGoal(goal.id)}
                  aria-label={`Remove goal ${goal.title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {onUpdate && (
            <Popover open={goalOpen} onOpenChange={(open) => { setGoalOpen(open); if (!open) setGoalSearch(""); }}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 px-2.5 text-sm"
                  disabled={availableGoals.length === 0}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Goal
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <div className="p-2 border-b border-border">
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                    placeholder="Search goals..."
                    value={goalSearch}
                    onChange={(e) => setGoalSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="p-1 max-h-[200px] overflow-y-auto">
                  {availableGoals.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      All goals linked.
                    </div>
                  ) : (
                    (() => {
                      const filtered = goalSearch.trim()
                        ? availableGoals.filter((g) =>
                            g.title.toLowerCase().includes(goalSearch.toLowerCase())
                          )
                        : availableGoals;
                      return filtered.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No matching goals.
                        </div>
                      ) : (
                        filtered.map((goal) => (
                          <button
                            key={goal.id}
                            className="flex w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent/50 transition-colors"
                            onClick={() => { addGoal(goal.id); setGoalSearch(""); }}
                          >
                            {goal.title}
                          </button>
                        ))
                      );
                    })()
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
