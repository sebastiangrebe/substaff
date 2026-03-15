import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import type { Agent, AgentRuntimeState } from "@substaff/shared";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "./StatusBadge";
import { Identity } from "./Identity";
import { formatDate, agentUrl } from "../lib/utils";
import { Separator } from "@/components/ui/separator";
import { BudgetEditor } from "./BudgetEditor";

interface AgentPropertiesProps {
  agent: Agent;
  runtimeState?: AgentRuntimeState;
}

const adapterLabels: Record<string, string> = {
  blaxel_sandbox: "Blaxel Sandbox",
  e2b_sandbox: "E2B Sandbox",
  process: "Process",
  http: "HTTP",
};

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

export function AgentProperties({ agent, runtimeState }: AgentPropertiesProps) {
  const { selectedCompanyId } = useCompany();
  const agentWithExtra = agent as Agent & {
    effectiveManagerId?: string | null;
    effectiveManagerName?: string | null;
  };

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!agent.reportsTo,
  });

  const reportsToAgent = agent.reportsTo ? agents?.find((a) => a.id === agent.reportsTo) : null;

  const effectiveManagerId = agent.managerId ?? agentWithExtra.effectiveManagerId ?? null;
  const effectiveManagerName = agentWithExtra.effectiveManagerName ?? null;
  const isInherited = !agent.managerId && !!effectiveManagerId;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PropertyRow label="Status">
          <StatusBadge status={agent.status} />
        </PropertyRow>
        <PropertyRow label="Role">
          <span className="text-sm">{agent.role}</span>
        </PropertyRow>
        {agent.title && (
          <PropertyRow label="Title">
            <span className="text-sm">{agent.title}</span>
          </PropertyRow>
        )}
        <PropertyRow label="Runtime">
          <span className="text-sm">{adapterLabels[agent.adapterType] ?? agent.adapterType}</span>
        </PropertyRow>
      </div>

      <Separator />

      <div className="space-y-1">
        {(runtimeState?.sessionDisplayId ?? runtimeState?.sessionId) && (
          <PropertyRow label="Session">
            <span className="text-xs font-mono">
              {String(runtimeState.sessionDisplayId ?? runtimeState.sessionId).slice(0, 12)}...
            </span>
          </PropertyRow>
        )}
        {runtimeState?.lastError && (
          <PropertyRow label="Last error">
            <span className="text-xs text-red-600 dark:text-red-400 truncate max-w-[160px]">{runtimeState.lastError}</span>
          </PropertyRow>
        )}
        {agent.lastHeartbeatAt && (
          <PropertyRow label="Last Active">
            <span className="text-sm">{formatDate(agent.lastHeartbeatAt)}</span>
          </PropertyRow>
        )}
        {agent.reportsTo && (
          <PropertyRow label="Reports To">
            {reportsToAgent ? (
              <Link to={agentUrl(reportsToAgent)} className="hover:underline">
                <Identity name={reportsToAgent.name} size="sm" />
              </Link>
            ) : (
              <span className="text-sm font-mono">{agent.reportsTo.slice(0, 8)}</span>
            )}
          </PropertyRow>
        )}
        {effectiveManagerId && (
          <PropertyRow label="Manager">
            <span className={`text-sm ${isInherited ? "text-muted-foreground/60" : ""}`}>
              {effectiveManagerName ?? effectiveManagerId.slice(0, 8)}
            </span>
            {isInherited && (
              <span className="text-[10px] text-muted-foreground/50 ml-1">(inherited)</span>
            )}
          </PropertyRow>
        )}
        <PropertyRow label="Created">
          <span className="text-sm">{formatDate(agent.createdAt)}</span>
        </PropertyRow>
        {agent.integrations && agent.integrations.length > 0 && (
          <PropertyRow label="Integrations">
            <div className="flex flex-wrap gap-1">
              {agent.integrations.map((slug) => (
                <span
                  key={slug}
                  className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                >
                  {slug}
                </span>
              ))}
            </div>
          </PropertyRow>
        )}
      </div>

      <Separator />

      <div>
        <span className="text-xs text-muted-foreground font-medium">Budget</span>
        <div className="mt-2">
          <BudgetEditor
            budgetMonthlyCents={agent.budgetMonthlyCents}
            platformSpentMonthlyCents={agent.platformSpentMonthlyCents}
            budgetTotalCents={agent.budgetTotalCents}
            platformSpentTotalCents={agent.platformSpentTotalCents}
          />
        </div>
      </div>
    </div>
  );
}
