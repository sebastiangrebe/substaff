import type { DashboardSummary } from "@substaff/shared";
import { type ApiClient } from "./client";

export function createDashboardApi(api: ApiClient) {
  return {
    summary: (companyId: string) => api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
  };
}
