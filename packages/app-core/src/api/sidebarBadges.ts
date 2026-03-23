import type { SidebarBadges } from "@substaff/shared";
import { type ApiClient } from "./client";

export function createSidebarBadgesApi(api: ApiClient) {
  return {
    get: (companyId: string) => api.get<SidebarBadges>(`/companies/${companyId}/sidebar-badges`),
  };
}
