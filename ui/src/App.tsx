import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Layout } from "./components/Layout";
import { AppLoader } from "./components/AppLoader";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { RouteErrorBoundary } from "./components/ErrorBoundary";
import { authApi } from "./api/auth";
import { healthApi } from "./api/health";
import { Dashboard } from "./pages/Dashboard";
import { Companies } from "./pages/Companies";
import { Agents } from "./pages/Agents";
import { AgentDetail } from "./pages/AgentDetail";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Issues } from "./pages/Issues";
import { IssueDetail } from "./pages/IssueDetail";
import { Goals } from "./pages/Goals";
import { GoalDetail } from "./pages/GoalDetail";
import { Approvals } from "./pages/Approvals";
import { ApprovalDetail } from "./pages/ApprovalDetail";
import { Billing } from "./pages/Billing";
import { Activity } from "./pages/Activity";
import { Files } from "./pages/Files";
import { Inbox } from "./pages/Inbox";
import { CompanySettings } from "./pages/CompanySettings";
import { AccountSettings } from "./pages/AccountSettings";
import { DesignGuide } from "./pages/DesignGuide";
import { Integrations } from "./pages/Integrations";
import { OrgChart } from "./pages/OrgChart";
import { Analytics } from "./pages/Analytics";
import { AuthPage } from "./pages/Auth";
import { InviteLandingPage } from "./pages/InviteLanding";
import { queryKeys } from "./lib/queryKeys";
import { useCompany } from "./context/CompanyContext";
import { useDialog } from "./context/DialogContext";
import type { RouteObject } from "react-router-dom";

function CloudAccessGate() {
  const location = useLocation();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
  });

  if (healthQuery.isLoading || (isAuthenticatedMode && sessionQuery.isLoading)) {
    return <AppLoader />;
  }

  if (healthQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-destructive">
        {healthQuery.error instanceof Error ? healthQuery.error.message : "Failed to load app state"}
      </div>
    );
  }

  if (isAuthenticatedMode && !sessionQuery.data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  return <Outlet />;
}

const boardRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="dashboard" replace /> },
  { path: "dashboard", element: <Dashboard /> },
  { path: "companies", element: <Companies /> },
  { path: "company/settings", element: <CompanySettings /> },
  { path: "account", element: <AccountSettings /> },
  { path: "org", element: <OrgChart /> },
  { path: "agents", element: <Navigate to="/agents/all" replace /> },
  { path: "agents/all", element: <Agents /> },
  { path: "agents/active", element: <Agents /> },
  { path: "agents/paused", element: <Agents /> },
  { path: "agents/error", element: <Agents /> },
  { path: "agents/:agentId", element: <AgentDetail /> },
  { path: "agents/:agentId/:tab", element: <AgentDetail /> },
  { path: "agents/:agentId/runs/:runId", element: <AgentDetail /> },
  { path: "projects", element: <Projects /> },
  { path: "projects/:projectId", element: <ProjectDetail /> },
  { path: "projects/:projectId/overview", element: <ProjectDetail /> },
  { path: "projects/:projectId/issues", element: <ProjectDetail /> },
  { path: "projects/:projectId/issues/:filter", element: <ProjectDetail /> },
  { path: "issues", element: <Issues /> },
  { path: "issues/all", element: <Navigate to="/issues" replace /> },
  { path: "issues/active", element: <Navigate to="/issues" replace /> },
  { path: "issues/backlog", element: <Navigate to="/issues" replace /> },
  { path: "issues/done", element: <Navigate to="/issues" replace /> },
  { path: "issues/recent", element: <Navigate to="/issues" replace /> },
  { path: "issues/:issueId", element: <IssueDetail /> },
  { path: "goals", element: <Goals /> },
  { path: "goals/:goalId", element: <GoalDetail /> },
  { path: "approvals", element: <Navigate to="/approvals/pending" replace /> },
  { path: "approvals/pending", element: <Approvals /> },
  { path: "approvals/all", element: <Approvals /> },
  { path: "approvals/:approvalId", element: <ApprovalDetail /> },
  { path: "billing", element: <Billing /> },
  { path: "analytics", element: <Analytics /> },
  { path: "activity", element: <Activity /> },
  { path: "files", element: <Files /> },
  { path: "inbox", element: <Navigate to="/inbox/new" replace /> },
  { path: "inbox/new", element: <Inbox /> },
  { path: "inbox/all", element: <Inbox /> },
  { path: "integrations", element: <Integrations /> },
  { path: "design-guide", element: <DesignGuide /> },
];

function CompanyRootRedirect() {
  const { companies, selectedCompany, loading } = useCompany();
  const { onboardingOpen } = useDialog();

  if (loading) {
    return <AppLoader />;
  }

  // Keep the first-run onboarding mounted until it completes.
  if (onboardingOpen) {
    return <NoCompaniesStartPage autoOpen={false} />;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    return <NoCompaniesStartPage />;
  }

  return <Navigate to={`/${targetCompany.issuePrefix}/dashboard`} replace />;
}

function UnprefixedBoardRedirect() {
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();

  if (loading) {
    return <AppLoader />;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    return <NoCompaniesStartPage />;
  }

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}${location.pathname}${location.search}${location.hash}`}
      replace
    />
  );
}

function NoCompaniesStartPage({ autoOpen = true }: { autoOpen?: boolean }) {
  const { openOnboarding } = useDialog();
  const opened = useRef(false);

  useEffect(() => {
    if (!autoOpen) return;
    if (opened.current) return;
    opened.current = true;
    openOnboarding();
  }, [autoOpen, openOnboarding]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Create your first workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up a workspace and start building your AI team.
        </p>
        <div className="mt-4">
          <Button onClick={() => openOnboarding()}>Get Started</Button>
        </div>
      </div>
    </div>
  );
}

/** Root layout that renders the OnboardingWizard alongside the route outlet */
function RootLayout() {
  return (
    <>
      <Outlet />
      <OnboardingWizard />
    </>
  );
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "auth", element: <AuthPage /> },
      { path: "invite/:token", element: <InviteLandingPage /> },
      {
        element: <CloudAccessGate />,
        children: [
          { index: true, element: <CompanyRootRedirect /> },
          { path: "companies", element: <UnprefixedBoardRedirect /> },
          { path: "issues", element: <UnprefixedBoardRedirect /> },
          { path: "issues/:issueId", element: <UnprefixedBoardRedirect /> },
          { path: "agents", element: <UnprefixedBoardRedirect /> },
          { path: "agents/:agentId", element: <UnprefixedBoardRedirect /> },
          { path: "agents/:agentId/:tab", element: <UnprefixedBoardRedirect /> },
          { path: "agents/:agentId/runs/:runId", element: <UnprefixedBoardRedirect /> },
          { path: "projects", element: <UnprefixedBoardRedirect /> },
          { path: "projects/:projectId", element: <UnprefixedBoardRedirect /> },
          { path: "projects/:projectId/overview", element: <UnprefixedBoardRedirect /> },
          { path: "projects/:projectId/issues", element: <UnprefixedBoardRedirect /> },
          { path: "projects/:projectId/issues/:filter", element: <UnprefixedBoardRedirect /> },
          { path: "goals", element: <UnprefixedBoardRedirect /> },
          { path: "goals/:goalId", element: <UnprefixedBoardRedirect /> },
          { path: "approvals", element: <UnprefixedBoardRedirect /> },
          { path: "approvals/:approvalId", element: <UnprefixedBoardRedirect /> },
          { path: "billing", element: <UnprefixedBoardRedirect /> },
          { path: "analytics", element: <UnprefixedBoardRedirect /> },
          { path: "activity", element: <UnprefixedBoardRedirect /> },
          { path: "files", element: <UnprefixedBoardRedirect /> },
          { path: "inbox", element: <UnprefixedBoardRedirect /> },
          { path: "inbox/:tab", element: <UnprefixedBoardRedirect /> },
          { path: "integrations", element: <UnprefixedBoardRedirect /> },
          { path: "company/settings", element: <UnprefixedBoardRedirect /> },
          { path: "account", element: <UnprefixedBoardRedirect /> },
          { path: "dashboard", element: <UnprefixedBoardRedirect /> },
          {
            path: ":companyPrefix",
            element: <Layout />,
            children: boardRoutes,
          },
        ],
      },
    ],
  },
];
