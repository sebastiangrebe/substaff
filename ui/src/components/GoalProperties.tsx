import { useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { Goal } from "@substaff/shared";
import { GOAL_STATUSES } from "@substaff/shared";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "./StatusBadge";
import { formatDate, cn, agentUrl } from "../lib/utils";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { ChevronDown } from "lucide-react";

interface GoalPropertiesProps {
  goal: Goal;
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

function label(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function PickerButton({
  current,
  options,
  onChange,
  children,
}: {
  current: string;
  options: readonly string[];
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={editableClasses}>
          {children}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {options.map((opt) => (
          <button
            key={opt}
            className={cn(
              "flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors",
              opt === current && "bg-accent"
            )}
            onClick={() => {
              onChange(opt);
              setOpen(false);
            }}
          >
            {label(opt)}
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
      <PropertyRow label="Status">
        {onUpdate ? (
          <PickerButton
            current={goal.status}
            options={GOAL_STATUSES}
            onChange={(status) => onUpdate({ status })}
          >
            <StatusBadge status={goal.status} />
          </PickerButton>
        ) : (
          <StatusBadge status={goal.status} />
        )}
      </PropertyRow>

      <PropertyRow label="Owner">
        {onUpdate ? (
          <OwnerPicker
            agents={agents ?? []}
            currentId={goal.ownerAgentId}
            onChange={(ownerAgentId) => onUpdate({ ownerAgentId })}
          />
        ) : ownerAgent ? (
          <Link
            to={agentUrl(ownerAgent)}
            className="text-sm hover:underline"
          >
            {ownerAgent.name}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        )}
      </PropertyRow>

      <PropertyRow label="Created">
        <span className="text-sm">{formatDate(goal.createdAt)}</span>
      </PropertyRow>

      <PropertyRow label="Updated">
        <span className="text-sm">{formatDate(goal.updatedAt)}</span>
      </PropertyRow>
    </div>
  );
}
