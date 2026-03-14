import {
  Briefcase,
  CircleDot,
  Home,
  BarChart3,
  DollarSign,
  History,
  Search,
  SquarePen,
  Settings,
  FolderOpen,
  Network,
  Plug,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarGoals } from "./SidebarGoals";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { CompanySwitcher } from "./CompanySwitcher";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { sidebarBadgesApi } from "../api/sidebarBadges";
import { heartbeatsApi } from "../api/heartbeats";
import { billingApi } from "../api/billing";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { TOUR_IDS } from "../hooks/useGuidedTour";

export function AppSidebar() {
  const { openNewIssue } = useDialog();
  const { selectedCompanyId } = useCompany();
  const { data: sidebarBadges } = useQuery({
    queryKey: queryKeys.sidebarBadges(selectedCompanyId!),
    queryFn: () => sidebarBadgesApi.get(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;

  const { data: billingInfo } = useQuery({
    queryKey: queryKeys.billing.me,
    queryFn: () => billingApi.getMyBilling(),
    refetchInterval: 60_000,
  });
  const balanceDepleted = (billingInfo?.creditBalanceCents ?? 1) <= 0;

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  return (
    <>
      <SidebarHeader>
        <CompanySwitcher />
        <button
          onClick={openSearch}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg bg-sidebar-accent/60 hover:bg-sidebar-accent text-muted-foreground text-sm transition-colors"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left text-xs">Search...</span>
          <kbd className="text-[10px] font-mono text-muted-foreground/50 bg-background/60 px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="scrollbar-none">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarNavItem id={TOUR_IDS.HOME} to="/dashboard" label="Home" icon={Home} liveCount={liveRunCount} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem
                  id={TOUR_IDS.MY_WORK}
                  to="/inbox"
                  label="My Work"
                  icon={Briefcase}
                  badge={sidebarBadges?.inbox}
                  badgeTone="danger"
                  alert={(sidebarBadges?.failedRuns ?? 0) > 0}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem id={TOUR_IDS.GOALS}>
                <SidebarGoals />
              </SidebarMenuItem>
              <SidebarMenuItem id={TOUR_IDS.PROJECTS}>
                <SidebarProjects />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem id={TOUR_IDS.TASKS} to="/issues" label="Tasks" icon={CircleDot} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <button
                  id={TOUR_IDS.NEW_TASK}
                  onClick={() => openNewIssue()}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <SquarePen className="h-3 w-3" />
                  </div>
                  <span className="truncate">New Task</span>
                </button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarAgents />

        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarNavItem id={TOUR_IDS.BUDGET} to="/billing" label="Billing" icon={DollarSign} alert={balanceDepleted} badgeTone="danger" />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem to="/org" label="Org Chart" icon={Network} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem to="/analytics" label="Analytics" icon={BarChart3} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem to="/activity" label="Activity" icon={History} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem id={TOUR_IDS.FILES} to="/files" label="Files" icon={FolderOpen} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem id={TOUR_IDS.INTEGRATIONS} to="/integrations" label="Connections" icon={Plug} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
