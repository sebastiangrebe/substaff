import {
  Briefcase,
  CircleDot,
  HelpCircle,
  Home,
  BarChart3,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Settings,
  FolderOpen,
  Plug,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarGoals } from "./SidebarGoals";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { sidebarBadgesApi } from "../api/sidebarBadges";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { useTour } from "./Tour";
import { TOUR_IDS } from "../hooks/useGuidedTour";

export function Sidebar() {
  const { openNewIssue } = useDialog();
  const tour = useTour();
  const { selectedCompanyId, selectedCompany } = useCompany();
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

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      {/* Top bar: Company name (bold) + Search */}
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        {selectedCompany?.brandColor && (
          <div
            className="w-4 h-4 rounded-sm shrink-0 ml-1"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <span className="flex-1 text-sm font-bold text-foreground truncate pl-1">
          {selectedCompany?.name ?? "Select workspace"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          onClick={openSearch}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-none flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {/* New Task button */}
          <button
            id={TOUR_IDS.NEW_TASK}
            onClick={() => openNewIssue()}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">New Task</span>
          </button>
          <SidebarNavItem id={TOUR_IDS.HOME} to="/dashboard" label="Home" icon={Home} liveCount={liveRunCount} />
          <SidebarNavItem
            id={TOUR_IDS.MY_WORK}
            to="/inbox"
            label="My Work"
            icon={Briefcase}
            badge={sidebarBadges?.inbox}
            badgeTone={sidebarBadges?.failedRuns ? "danger" : "default"}
            alert={(sidebarBadges?.failedRuns ?? 0) > 0}
          />
        </div>

        <SidebarSection label="Work">
          <div id={TOUR_IDS.GOALS}><SidebarGoals /></div>
          <div id={TOUR_IDS.PROJECTS}><SidebarProjects /></div>
          <SidebarNavItem id={TOUR_IDS.TASKS} to="/issues" label="Tasks" icon={CircleDot} />
        </SidebarSection>

        <SidebarAgents />

        <SidebarSection label="Manage">
          <SidebarNavItem to="/org" label="Org Chart" icon={Network} />
          <SidebarNavItem id={TOUR_IDS.BUDGET} to="/costs" label="Budget" icon={DollarSign} />
          <SidebarNavItem to="/analytics" label="Analytics" icon={BarChart3} />
          <SidebarNavItem to="/activity" label="Activity" icon={History} />
          <SidebarNavItem id={TOUR_IDS.FILES} to="/files" label="Files" icon={FolderOpen} />
          <SidebarNavItem id={TOUR_IDS.INTEGRATIONS} to="/integrations" label="Integrations" icon={Plug} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
        </SidebarSection>

        {/* Take a tour */}
        <div className="mt-auto px-3 pb-2">
          <button
            onClick={() => tour.startTour()}
            className="flex items-center gap-2.5 px-3 py-2 w-full text-[13px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <HelpCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">Take a tour</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
