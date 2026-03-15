import { useState, type CSSProperties } from "react";
import { Link } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PROJECT_STATUSES, type Project } from "@substaff/shared";
import { StatusBadge } from "./StatusBadge";
import { Identity } from "./Identity";
import { formatDate, cn } from "../lib/utils";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowUpRight, Plus, Target, User, X } from "lucide-react";
import { BudgetEditor } from "./BudgetEditor";


interface ProjectPropertiesProps {
  project: Project;
  onUpdate?: (data: Record<string, unknown>) => void;
}

function PropertyCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

const editableClasses =
  "inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors";

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
        <button className={editableClasses}>
          {current ? (
            <Identity name={current.name} size="sm" />
          ) : (
            <>
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">No lead</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end" collisionPadding={16}>
        <button
          className={cn(
            "flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors",
            !currentId && "bg-accent"
          )}
          onClick={() => { onChange(null); setOpen(false); }}
        >
          No lead
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

  const removeGoal = (goalId: string) => {
    if (!onUpdate) return;
    onUpdate({ goalIds: linkedGoalIds.filter((id) => id !== goalId) });
  };

  const addGoal = (goalId: string) => {
    if (!onUpdate || linkedGoalIds.includes(goalId)) return;
    onUpdate({ goalIds: [...linkedGoalIds, goalId] });
    setGoalOpen(false);
  };

  const leadAgent = project.leadAgentId
    ? agents?.find((a) => a.id === project.leadAgentId)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-x-4 gap-y-3">
        {/* Row 1: Status, Lead, Target/Created, Updated */}
        <PropertyCell label="Status">
          <span style={{ viewTransitionName: `entity-status-${project.id}` } as CSSProperties}>
            {onUpdate ? (
              <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                <PopoverTrigger asChild>
                  <button className={editableClasses}>
                    <StatusBadge status={project.status} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1" align="start" collisionPadding={16}>
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
          </span>
        </PropertyCell>

        <PropertyCell label="Lead">
          <span className="flex items-center gap-1">
            {onUpdate ? (
              <LeadPicker
                agents={agents ?? []}
                currentId={project.leadAgentId}
                onChange={(leadAgentId) => onUpdate({ leadAgentId })}
              />
            ) : leadAgent ? (
              <Identity name={leadAgent.name} size="sm" />
            ) : (
              <>
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No lead</span>
              </>
            )}
            {leadAgent && (
              <Link
                to={`/agents/${leadAgent.id}`}
                className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </span>
        </PropertyCell>

        {project.targetDate && (
          <PropertyCell label="Target">
            <span className="text-sm">{formatDate(project.targetDate)}</span>
          </PropertyCell>
        )}

        <PropertyCell label="Created">
          <span className="text-sm">{formatDate(project.createdAt)}</span>
        </PropertyCell>

        {!project.targetDate && (
          <PropertyCell label="Updated">
            <span className="text-sm">{formatDate(project.updatedAt)}</span>
          </PropertyCell>
        )}

        {/* Row 2: Budget + Updated (if target date shown above) */}
        <div className="col-span-2">
          <BudgetEditor
            budgetMonthlyCents={project.budgetMonthlyCents}
            platformSpentMonthlyCents={project.platformSpentMonthlyCents}
            budgetTotalCents={project.budgetTotalCents}
            platformSpentTotalCents={project.platformSpentTotalCents}
            onUpdateMonthly={onUpdate ? (cents) => onUpdate({ budgetMonthlyCents: cents }) : undefined}
            onUpdateTotal={onUpdate ? (cents) => onUpdate({ budgetTotalCents: cents }) : undefined}
          />
        </div>

        {project.targetDate && (
          <PropertyCell label="Updated">
            <span className="text-sm">{formatDate(project.updatedAt)}</span>
          </PropertyCell>
        )}
      </div>

      {/* Goals section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Goals</span>
          {onUpdate && (
            <Popover open={goalOpen} onOpenChange={(open) => { setGoalOpen(open); if (!open) setGoalSearch(""); }}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto gap-1 text-xs text-muted-foreground hover:text-foreground h-6 px-1.5"
                  disabled={availableGoals.length === 0}
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end" collisionPadding={16}>
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
        {linkedGoals.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 pl-5.5">No linked goals</p>
        ) : (
          <div className="space-y-1">
            {linkedGoals.map((goal) => (
              <div
                key={goal.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm group hover:bg-accent/30 transition-colors"
              >
                <Link to={`/goals/${goal.id}`} className="flex-1 min-w-0 truncate hover:underline">
                  {goal.title}
                </Link>
                {onUpdate && (
                  <button
                    className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    type="button"
                    onClick={() => removeGoal(goal.id)}
                    aria-label={`Remove goal ${goal.title}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
