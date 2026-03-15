import { useState, type CSSProperties } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { Goal } from "@substaff/shared";
import { GOAL_STATUSES } from "@substaff/shared";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "./StatusBadge";
import { Identity } from "./Identity";
import { formatDate, cn, agentUrl } from "../lib/utils";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { User, ArrowUpRight } from "lucide-react";
import { BudgetEditor } from "./BudgetEditor";

interface GoalPropertiesProps {
  goal: Goal;
  onUpdate?: (data: Record<string, unknown>) => void;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">{children}</div>
    </div>
  );
}

const editableClasses =
  "inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors";

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusPicker({
  goal,
  onUpdate,
}: {
  goal: Goal;
  onUpdate: (data: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={editableClasses}>
          <StatusBadge status={goal.status} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="end" collisionPadding={16}>
        {GOAL_STATUSES.map((opt) => (
          <button
            key={opt}
            className={cn(
              "flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors",
              opt === goal.status && "bg-accent"
            )}
            onClick={() => {
              onUpdate({ status: opt });
              setOpen(false);
            }}
          >
            {statusLabel(opt)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function OwnerPicker({
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
              <span className="text-sm text-muted-foreground">No owner</span>
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
          No owner
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

export function GoalProperties({ goal, onUpdate }: GoalPropertiesProps) {
  const { selectedCompanyId } = useCompany();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const ownerAgent = goal.ownerAgentId
    ? agents?.find((a) => a.id === goal.ownerAgentId)
    : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PropertyRow label="Status">
          <span style={{ viewTransitionName: `entity-status-${goal.id}` } as CSSProperties}>
            {onUpdate ? (
              <StatusPicker goal={goal} onUpdate={onUpdate} />
            ) : (
              <StatusBadge status={goal.status} />
            )}
          </span>
        </PropertyRow>

        <PropertyRow label="Owner">
          <span className="flex items-center gap-1" style={{ viewTransitionName: `entity-owner-${goal.id}` } as CSSProperties}>
            {onUpdate ? (
              <OwnerPicker
                agents={agents ?? []}
                currentId={goal.ownerAgentId}
                onChange={(ownerAgentId) => onUpdate({ ownerAgentId })}
              />
            ) : ownerAgent ? (
              <Identity name={ownerAgent.name} size="sm" />
            ) : (
              <>
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No owner</span>
              </>
            )}
            {ownerAgent && (
              <Link
                to={agentUrl(ownerAgent)}
                className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </span>
        </PropertyRow>
      </div>

      <Separator />

      <div>
        <span className="text-xs text-muted-foreground font-medium">Budget</span>
        <div className="mt-2">
          <BudgetEditor
            budgetMonthlyCents={goal.budgetMonthlyCents}
            platformSpentMonthlyCents={goal.platformSpentMonthlyCents}
            budgetTotalCents={goal.budgetTotalCents}
            platformSpentTotalCents={goal.platformSpentTotalCents}
            onUpdateMonthly={onUpdate ? (cents) => onUpdate({ budgetMonthlyCents: cents }) : undefined}
            onUpdateTotal={onUpdate ? (cents) => onUpdate({ budgetTotalCents: cents }) : undefined}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-1">
        <PropertyRow label="Created">
          <span className="text-sm">{formatDate(goal.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label="Updated">
          <span className="text-sm">{formatDate(goal.updatedAt)}</span>
        </PropertyRow>
      </div>
    </div>
  );
}
