import { useMemo } from "react";
import {
  Bot,
  Briefcase,
  ChevronDown,
  CircleDot,
  FolderKanban,
  Home,
  BarChart3,
  Plus,
  Search,
  Settings,
  FolderOpen,
  HelpCircle,
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
import { costsApi } from "../api/costs";
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
import { Skeleton } from "@/components/ui/skeleton";
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

/** Grid tile link button with icon + label for the 2×2 manage grid */
function GridNavButton({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }: { isActive: boolean }) =>
        cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground transition-all duration-150",
          "hover:text-foreground hover:bg-sidebar-accent",
          isActive && "text-foreground bg-sidebar-accent"
        )
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[11px] leading-none truncate">{label}</span>
    </NavLink>
  );
}

/** Grid tile action button with icon + label for the 2×2 manage grid */
function GridActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-sidebar-accent"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[11px] leading-none truncate">{label}</span>
    </button>
  );
}

/** Format cents as a dollar string with $ prefix (e.g. 810 → "$8.10", 310000 → "$3,100") */
function formatCents(cents: number, showSign = false): string {
  const dollars = Math.abs(cents) / 100;
  const prefix = showSign && cents < 0 ? "-$" : "$";
  if (dollars >= 1000) return prefix + dollars.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (dollars >= 100) return prefix + dollars.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return prefix + dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  const { data: billingInfo, isLoading: billingLoading } = useQuery({
    queryKey: queryKeys.billing.me,
    queryFn: () => billingApi.getMyBilling(),
    refetchInterval: 60_000,
  });

  // MTD cost summary for sidebar credit card
  const mtdFrom = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }, []);
  const { data: mtdCosts } = useQuery({
    queryKey: queryKeys.costs(selectedCompanyId!, mtdFrom, undefined),
    queryFn: () => costsApi.summary(selectedCompanyId!, mtdFrom),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

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
              className="flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-sm font-medium text-white transition-all duration-150 hover:brightness-110 active:scale-[0.97]"
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

      </SidebarContent>

      {/* Sticky bottom section — budget card + manage grid */}
      <div className="shrink-0 border-t border-sidebar-border px-2 py-2 flex flex-col gap-2">
        {/* Credit usage card */}
        <div id={TOUR_IDS.BUDGET}>
          {billingLoading || !billingInfo ? (
            <div className="rounded-lg border border-border/40 bg-sidebar-accent/30 px-3 py-2.5 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="w-full h-1.5 rounded-full" />
            </div>
          ) : (() => {
            const spent = mtdCosts?.platformSpendCents ?? 0;
            const balance = billingInfo.creditBalanceCents;
            const depleted = balance <= 0;
            const remaining = Math.max(0, balance);
            const total = spent + remaining;
            const pct = total > 0 ? Math.min(100, (spent / total) * 100) : (spent > 0 ? 100 : 0);
            return (
              <NavLink
                to="/billing"
                className={cn(
                  "block rounded-lg border px-3 py-2.5 min-w-0 transition-colors",
                  depleted
                    ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
                    : "border-border/40 bg-sidebar-accent/30 hover:bg-sidebar-accent/50"
                )}
              >
                {depleted ? (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-red-500">Balance depleted</span>
                      <span className="text-xs text-red-500">
                        {formatCents(balance, true)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Add credits to resume</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Credits used</span>
                      <span className="text-xs font-semibold">
                        {formatCents(spent)}/{formatCents(total)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          pct >= 90
                            ? "bg-red-500"
                            : pct >= 60
                              ? "bg-yellow-400"
                              : "bg-green-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                )}
              </NavLink>
            );
          })()}
        </div>

        {/* Manage — 2×2 grid */}
        <div className="grid grid-cols-2 gap-1">
          <GridNavButton to="/analytics" icon={BarChart3} label="Analytics" />
          <GridNavButton to="/company/settings" icon={Settings} label="Settings" />
          {onToggleTheme && themeIcon && (
            <GridActionButton icon={themeIcon} label={themeLabel ?? "Toggle theme"} onClick={onToggleTheme} />
          )}
          {onTakeTour && (
            <GridActionButton icon={HelpCircle} label="Take a tour" onClick={onTakeTour} />
          )}
        </div>
      </div>
    </>
  );
}
