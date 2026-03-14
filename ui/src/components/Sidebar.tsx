import {
  Briefcase,
  CircleDot,
  Home,
  BarChart3,
  DollarSign,
  History,
  Search,
  Settings,
  FolderOpen,
  Network,
  Plug,
  Sparkles,
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
  SidebarSeparator,
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
import { TOUR_IDS } from "../hooks/useGuidedTour";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NavLink } from "@/lib/router";
import { cn } from "../lib/utils";
import type { LucideIcon } from "lucide-react";

/** Compact icon-only nav button for the bottom manage strip */
function ManageIconButton({
  to,
  icon: Icon,
  label,
  alert,
  id,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  alert?: boolean;
  id?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          id={id}
          to={to}
          className={({ isActive }: { isActive: boolean }) =>
            cn(
              "relative flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground transition-all duration-150",
              "hover:text-foreground hover:bg-sidebar-accent",
              isActive && "text-foreground bg-sidebar-accent"
            )
          }
        >
          <Icon className="h-4 w-4" />
          {alert && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_hsl(var(--sidebar))]" />
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

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

        {/* Primary CTA — New Task */}
        <button
          id={TOUR_IDS.NEW_TASK}
          onClick={() => openNewIssue()}
          className="group/cta relative flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground overflow-hidden transition-all duration-200 hover:shadow-md hover:shadow-primary/20 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, oklch(0.55 0.18 265), oklch(0.50 0.22 280))",
          }}
        >
          <div className="absolute inset-0 bg-white/0 group-hover/cta:bg-white/10 transition-colors duration-200" />
          <Sparkles className="h-4 w-4 relative z-10" />
          <span className="relative z-10">New Task</span>
          <kbd className="relative z-10 text-[10px] font-mono text-white/50 bg-white/10 px-1.5 py-0.5 rounded ml-auto">
            C
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="scrollbar-none">
        {/* Core navigation */}
        <SidebarGroup className="pb-0">
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

        <SidebarSeparator />

        {/* Work section */}
        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50">Work</SidebarGroupLabel>
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
                <SidebarNavItem id={TOUR_IDS.FILES} to="/files" label="Files" icon={FolderOpen} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavItem id={TOUR_IDS.INTEGRATIONS} to="/integrations" label="Connections" icon={Plug} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Team section */}
        <SidebarAgents />

        {/* Spacer pushes manage strip to bottom */}
        <div className="flex-1" />

        <SidebarSeparator />

        {/* Manage — compact icon strip */}
        <SidebarGroup className="py-1.5">
          <SidebarGroupContent>
            <div className="flex items-center justify-between px-1">
              <ManageIconButton id={TOUR_IDS.BUDGET} to="/billing" icon={DollarSign} label="Billing" alert={balanceDepleted} />
              <ManageIconButton to="/org" icon={Network} label="Org Chart" />
              <ManageIconButton to="/analytics" icon={BarChart3} label="Analytics" />
              <ManageIconButton to="/activity" icon={History} label="Activity" />
              <ManageIconButton to="/company/settings" icon={Settings} label="Settings" />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
