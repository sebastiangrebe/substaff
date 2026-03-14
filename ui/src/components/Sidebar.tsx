import {
  Bot,
  Briefcase,
  ChevronDown,
  CircleDot,
  FolderKanban,
  Home,
  BarChart3,
  DollarSign,
  History,
  Plus,
  Search,
  Settings,
  FolderOpen,
  HelpCircle,
  Network,
  Plug,
  Target,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
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
import { billingApi } from "../api/billing";
import { queryKeys, sharedQueries } from "../lib/queryKeys";
import { TOUR_IDS } from "../hooks/useGuidedTour";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
          <span className="relative">
            <Icon className="h-4 w-4" />
            {alert && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_hsl(var(--sidebar))]" />
            )}
          </span>
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Generic icon button for the bottom strip (non-link variant) */
function ManageActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="relative flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-sidebar-accent"
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface AppSidebarProps {
  onToggleTheme?: () => void;
  themeIcon?: LucideIcon;
  themeLabel?: string;
  onTakeTour?: () => void;
}

export function AppSidebar({ onToggleTheme, themeIcon, themeLabel, onTakeTour }: AppSidebarProps) {
  const { openNewIssue, openNewProject, openNewGoal, openNewAgent } = useDialog();
  const { selectedCompanyId } = useCompany();
  const { data: sidebarBadges } = useQuery(sharedQueries.sidebarBadges(selectedCompanyId!));
  const { data: liveRuns } = useQuery(sharedQueries.liveRuns(selectedCompanyId!));
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
      <SidebarHeader className="gap-1.5 pb-0">
        <CompanySwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              id={TOUR_IDS.NEW_TASK}
              className="flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-sm font-medium text-primary-foreground transition-all duration-150 hover:brightness-110 active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, oklch(0.55 0.18 265), oklch(0.48 0.20 280))",
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Create new</span>
              <ChevronDown className="h-3 w-3 ml-auto opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4} className="w-[var(--radix-dropdown-menu-trigger-width)]">
            <DropdownMenuItem onClick={() => openNewIssue()}>
              <CircleDot className="mr-2 h-4 w-4" />
              New Task
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openNewProject()}>
              <FolderKanban className="mr-2 h-4 w-4" />
              New Project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openNewGoal()}>
              <Target className="mr-2 h-4 w-4" />
              New Goal
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openNewAgent()}>
              <Bot className="mr-2 h-4 w-4" />
              New Agent
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="scrollbar-none">
        {/* Core navigation */}
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Search" onClick={openSearch} className="text-muted-foreground">
                  <Search className="h-4 w-4" />
                  <span className="flex-1 truncate">Search</span>
                  <kbd className="text-[10px] font-mono text-muted-foreground/40">⌘K</kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
            <div className="flex items-center justify-center gap-0.5 px-1">
              <ManageIconButton id={TOUR_IDS.BUDGET} to="/billing" icon={DollarSign} label="Billing" alert={balanceDepleted} />
              <ManageIconButton to="/org" icon={Network} label="Org Chart" />
              <ManageIconButton to="/analytics" icon={BarChart3} label="Analytics" />
              <ManageIconButton to="/activity" icon={History} label="Activity" />
              <ManageIconButton to="/company/settings" icon={Settings} label="Settings" />
              {onToggleTheme && themeIcon && (
                <ManageActionButton icon={themeIcon} label={themeLabel ?? "Toggle theme"} onClick={onToggleTheme} />
              )}
              {onTakeTour && (
                <ManageActionButton icon={HelpCircle} label="Take a tour" onClick={onTakeTour} />
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
