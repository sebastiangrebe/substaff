import { forwardRef, useMemo } from "react";
import type { Agent } from "@substaff/shared";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import { AgentIcon } from "./AgentIconPicker";

interface AgentSelectorProps {
  /** Currently selected agent ID (empty string = none). */
  value: string;
  /** Full agent list — terminated agents are filtered out automatically. */
  agents: Agent[];
  /** Placeholder shown when no agent is selected. */
  placeholder?: string;
  /** Label for the "none" option. */
  noneLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onChange: (agentId: string) => void;
  /** Called after a selection is committed (e.g. to advance focus). */
  onConfirm?: () => void;
  className?: string;
}

export const AgentSelector = forwardRef<HTMLButtonElement, AgentSelectorProps>(
  function AgentSelector(
    {
      value,
      agents,
      placeholder = "Agent",
      noneLabel = "No agent",
      searchPlaceholder = "Search agents...",
      emptyMessage = "No agents found.",
      onChange,
      onConfirm,
      className,
    },
    ref,
  ) {
    const activeAgents = useMemo(
      () => agents.filter((a) => a.status !== "terminated"),
      [agents],
    );

    const options = useMemo<InlineEntityOption[]>(
      () =>
        activeAgents.map((agent) => ({
          id: agent.id,
          label: agent.name,
          searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
        })),
      [activeAgents],
    );

    const currentAgent = activeAgents.find((a) => a.id === value);

    return (
      <InlineEntitySelector
        ref={ref}
        value={value}
        options={options}
        placeholder={placeholder}
        noneLabel={noneLabel}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        onChange={onChange}
        onConfirm={onConfirm}
        className={className}
        renderTriggerValue={(option) =>
          option && currentAgent ? (
            <>
              <AgentIcon icon={currentAgent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{option.label}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )
        }
        renderOption={(option) => {
          if (!option.id) return <span className="truncate">{option.label}</span>;
          const agent = activeAgents.find((a) => a.id === option.id);
          return (
            <>
              <AgentIcon icon={agent?.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{option.label}</span>
            </>
          );
        }}
      />
    );
  },
);
