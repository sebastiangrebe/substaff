import { useMemo } from "react";
import { createApiClient } from "@substaff/app-core/api/client";
import { createAgentsApi } from "@substaff/app-core/api/agents";
import { createIssuesApi } from "@substaff/app-core/api/issues";
import { createApprovalsApi } from "@substaff/app-core/api/approvals";
import { createProjectsApi } from "@substaff/app-core/api/projects";
import { createGoalsApi } from "@substaff/app-core/api/goals";
import { createDashboardApi } from "@substaff/app-core/api/dashboard";
import { createHeartbeatsApi } from "@substaff/app-core/api/heartbeats";
import { createCompaniesApi } from "@substaff/app-core/api/companies";
import { createSidebarBadgesApi } from "@substaff/app-core/api/sidebarBadges";
import { nativeRequest } from "../platform/network";

const apiClient = createApiClient(nativeRequest);

export function useApi() {
  return useMemo(
    () => ({
      client: apiClient,
      agentsApi: createAgentsApi(apiClient),
      issuesApi: createIssuesApi(apiClient),
      approvalsApi: createApprovalsApi(apiClient),
      projectsApi: createProjectsApi(apiClient),
      goalsApi: createGoalsApi(apiClient),
      dashboardApi: createDashboardApi(apiClient),
      heartbeatsApi: createHeartbeatsApi(apiClient),
      companiesApi: createCompaniesApi(apiClient),
      sidebarBadgesApi: createSidebarBadgesApi(apiClient),
    }),
    [],
  );
}
