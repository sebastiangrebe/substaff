import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Moon, Sun } from "lucide-react";
import { Outlet, useLocation, useNavigate, useParams } from "@/lib/router";
import {
  Sidebar,
  SidebarFooter,
  SidebarProvider,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./Sidebar";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { PropertiesPanel } from "./PropertiesPanel";
import { CommandPalette } from "./CommandPalette";
import { NewIssueDialog } from "./NewIssueDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { NewGoalDialog } from "./NewGoalDialog";
import { NewAgentDialog } from "./NewAgentDialog";
import { ToastViewport } from "./ToastViewport";
import { MobileBottomNav } from "./MobileBottomNav";
import { useDialog } from "../context/DialogContext";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useTheme } from "../context/ThemeContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useCompanyPageMemory } from "../hooks/useCompanyPageMemory";
import { healthApi } from "../api/health";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { useGuidedTour } from "../hooks/useGuidedTour";
import { useTour } from "./Tour";

export function Layout() {
  return (
    <SidebarProvider>
      <LayoutInner />
    </SidebarProvider>
  );
}

function LayoutInner() {
  const { open, setOpen, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const { openNewIssue, openNewProject, openNewGoal, openNewAgent, openOnboarding, onboardingOpen, setOnboardingRequired } = useDialog();
  const { togglePanelVisible } = usePanel();
  const { companies, loading: companiesLoading, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const tour = useTour();
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const onboardingTriggered = useRef(false);
  const lastMainScrollTop = useRef(0);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const { data: health } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  // Query agents for the selected company to check onboarding completeness
  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.agents.list(selectedCompanyId) : ["agents", "__none__"],
    queryFn: () => selectedCompanyId ? agentsApi.list(selectedCompanyId) : Promise.resolve([]),
    enabled: !companiesLoading && companies.length > 0 && !!selectedCompanyId,
    retry: false,
  });

  // Force onboarding if setup is incomplete (no company or no agents)
  useEffect(() => {
    if (companiesLoading || agentsLoading) return;
    if (onboardingTriggered.current && onboardingOpen) return;

    const hasCompany = companies.length > 0;
    const hasAgent = (agents ?? []).length > 0;

    if (!hasCompany) {
      onboardingTriggered.current = true;
      setOnboardingRequired(true);
      openOnboarding({ initialStep: 1 });
    } else if (!hasAgent) {
      onboardingTriggered.current = true;
      setOnboardingRequired(true);
      openOnboarding({ initialStep: 2, companyId: selectedCompanyId ?? undefined });
    } else {
      setOnboardingRequired(false);
      onboardingTriggered.current = false;
    }
  }, [companies, companiesLoading, agents, agentsLoading, openOnboarding, onboardingOpen, selectedCompanyId, setOnboardingRequired]);

  useEffect(() => {
    if (!companyPrefix || companiesLoading || companies.length === 0) return;

    const requestedPrefix = companyPrefix.toUpperCase();
    const matched = companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix);

    if (!matched) {
      const fallback =
        (selectedCompanyId ? companies.find((company) => company.id === selectedCompanyId) : null)
        ?? companies[0]!;
      navigate(`/${fallback.issuePrefix}/dashboard`, { replace: true });
      return;
    }

    if (companyPrefix !== matched.issuePrefix) {
      const suffix = location.pathname.replace(/^\/[^/]+/, "");
      navigate(`/${matched.issuePrefix}${suffix}${location.search}`, { replace: true });
      return;
    }

    if (selectedCompanyId !== matched.id) {
      setSelectedCompanyId(matched.id, { source: "route_sync" });
    }
  }, [
    companyPrefix,
    companies,
    companiesLoading,
    location.pathname,
    location.search,
    navigate,
    selectedCompanyId,
    setSelectedCompanyId,
  ]);

  const togglePanel = togglePanelVisible;

  // Cmd+1..9 to switch companies
  const switchCompany = useCallback(
    (index: number) => {
      if (index < companies.length) {
        setSelectedCompanyId(companies[index]!.id);
      }
    },
    [companies, setSelectedCompanyId],
  );

  useCompanyPageMemory();
  useGuidedTour();

  useKeyboardShortcuts({
    onNewIssue: () => openNewIssue(),
    onNewProject: () => openNewProject(),
    onNewGoal: () => openNewGoal(),
    onNewAgent: () => openNewAgent(),
    onToggleSidebar: toggleSidebar,
    onTogglePanel: togglePanel,
    onSwitchCompany: switchCompany,
  });

  useEffect(() => {
    if (!isMobile) {
      setMobileNavVisible(true);
      return;
    }
    lastMainScrollTop.current = 0;
    setMobileNavVisible(true);
  }, [isMobile]);

  const handleMainScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      if (!isMobile) return;

      const currentTop = event.currentTarget.scrollTop;
      const delta = currentTop - lastMainScrollTop.current;

      if (currentTop <= 24) {
        setMobileNavVisible(true);
      } else if (delta > 8) {
        setMobileNavVisible(false);
      } else if (delta < -8) {
        setMobileNavVisible(true);
      }

      lastMainScrollTop.current = currentTop;
    },
    [isMobile],
  );

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to Main Content
      </a>

      <Sidebar>
        <AppSidebar />
        <SidebarFooter>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground shrink-0"
              onClick={toggleTheme}
              aria-label={`Switch to ${nextTheme} mode`}
              title={`Switch to ${nextTheme} mode`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0 gap-1.5 text-xs"
              onClick={() => tour.startTour()}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Take a tour
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {isMobile && <BreadcrumbBar />}
        <div className="flex flex-1 min-h-0">
          <main
            id="main-content"
            tabIndex={-1}
            className={cn("flex-1 overflow-auto p-4 md:p-6", isMobile && "pb-[calc(5rem+env(safe-area-inset-bottom))]")}
            onScroll={handleMainScroll}
          >
            {!isMobile && <BreadcrumbBar />}
            <Outlet />
          </main>
          <PropertiesPanel />
        </div>
      </SidebarInset>

      {isMobile && <MobileBottomNav visible={mobileNavVisible} />}
      <CommandPalette />
      <NewIssueDialog />
      <NewProjectDialog />
      <NewGoalDialog />
      <NewAgentDialog />
      <ToastViewport />
    </>
  );
}
