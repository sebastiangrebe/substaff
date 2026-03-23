import type { SidebarBadges } from "@substaff/shared";
import type { LiveRunForIssue } from "../api/heartbeats.js";

interface SharedQueryApis {
  heartbeatsApi: {
    liveRunsForCompany: (companyId: string, minCount?: number) => Promise<LiveRunForIssue[]>;
  };
  sidebarBadgesApi: {
    get: (companyId: string) => Promise<SidebarBadges>;
  };
}

export function createSharedQueries(apis: SharedQueryApis) {
  return {
    liveRuns: (companyId: string) => ({
      queryKey: ["live-runs", companyId] as const,
      queryFn: () => apis.heartbeatsApi.liveRunsForCompany(companyId),
      enabled: !!companyId,
      staleTime: 10_000,
      refetchInterval: 10_000,
    }),
    sidebarBadges: (companyId: string) => ({
      queryKey: ["sidebar-badges", companyId] as const,
      queryFn: () => apis.sidebarBadgesApi.get(companyId),
      enabled: !!companyId,
      staleTime: 15_000,
      refetchInterval: 15_000,
    }),
  };
}
