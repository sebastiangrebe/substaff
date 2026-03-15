import { useMemo, useState } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Network } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useSidebar, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";
import { agentsApi } from "../api/agents";
import { queryKeys, sharedQueries } from "../lib/queryKeys";
import { cn, agentRouteRef, agentUrl } from "../lib/utils";
import { AgentIcon } from "./AgentIconPicker";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Agent } from "@substaff/shared";

/** BFS sort: roots first (no reportsTo), then their direct reports, etc. */
function sortByHierarchy(agents: Agent[]): Agent[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenOf = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const parent = a.reportsTo && byId.has(a.reportsTo) ? a.reportsTo : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(a);
    childrenOf.set(parent, list);
  }
  const sorted: Agent[] = [];
  const queue = childrenOf.get(null) ?? [];
  while (queue.length > 0) {
    const agent = queue.shift()!;
    sorted.push(agent);
    const children = childrenOf.get(agent.id);
    if (children) queue.push(...children);
  }
  return sorted;
}

const statusDotColor: Record<string, string> = {
  active: "bg-emerald-500",
  running: "bg-cyan-400",
  paused: "bg-amber-400",
  error: "bg-red-500",
  idle: "bg-muted-foreground/30",
  offline: "bg-muted-foreground/20",
};

export function SidebarAgents() {
  const [open, setOpen] = useState(true);
  const { selectedCompanyId } = useCompany();
  const { isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery(sharedQueries.liveRuns(selectedCompanyId!));

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

  const visibleAgents = useMemo(() => {
    const filtered = (agents ?? []).filter(
      (a: Agent) => a.status !== "terminated"
    );
    return sortByHierarchy(filtered);
  }, [agents]);

  const agentMatch = location.pathname.match(/^\/(?:[^/]+\/)?agents\/([^/]+)/);
  const activeAgentId = agentMatch?.[1] ?? null;

  return (
    <SidebarGroup id="tour-team" className="py-0">
      <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50">Team</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <Collapsible open={open} onOpenChange={setOpen}>
            <SidebarMenuItem>
              <div className="flex items-center">
                <SidebarMenuButton asChild tooltip="Team" isActive={/^\/(?:[^/]+\/)?agents(\/|$)/.test(location.pathname)} className="flex-1 min-w-0">
                  <NavLink
                    to="/agents/all"
                    onClick={() => { if (isMobile) setOpenMobile(false); }}
                  >
                    <span className="flex-1 truncate">All agents</span>
                  </NavLink>
                </SidebarMenuButton>
                <NavLink
                  to="/org"
                  className="flex items-center justify-center h-5 w-5 shrink-0 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                  onClick={() => { if (isMobile) setOpenMobile(false); }}
                >
                  <Network className="h-2.5 w-2.5" />
                </NavLink>
                <CollapsibleTrigger className="flex items-center justify-center h-8 w-8 shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors">
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 transition-transform",
                      open && "rotate-90"
                    )}
                  />
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent>
                <SidebarMenuSub>
                  {visibleAgents.map((agent: Agent) => {
                    const runCount = liveCountByAgent.get(agent.id) ?? 0;
                    const isWorking = runCount > 0;
                    const dotColor = isWorking
                      ? "bg-cyan-400"
                      : statusDotColor[agent.status] ?? statusDotColor.idle;

                    return (
                      <SidebarMenuSubItem key={agent.id}>
                        <SidebarMenuSubButton asChild isActive={activeAgentId === agentRouteRef(agent)}>
                          <NavLink
                            to={agentUrl(agent)}
                            onClick={() => { if (isMobile) setOpenMobile(false); }}
                          >
                            <span className="relative shrink-0">
                              <AgentIcon icon={agent.icon} className="h-4 w-4 text-muted-foreground" />
                              <span
                                className={cn(
                                  "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full shadow-[0_0_0_2px_hsl(var(--sidebar))]",
                                  dotColor,
                                  isWorking && "animate-pulse"
                                )}
                              />
                            </span>
                            <span className="truncate">{agent.name}</span>
                            {isWorking && (
                              <span className="ml-auto text-[10px] font-medium text-cyan-600 dark:text-cyan-400 tabular-nums shrink-0">
                                {runCount}
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
