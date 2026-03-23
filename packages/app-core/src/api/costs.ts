import type { CostSummary, CostByAgent, CostByProject } from "@substaff/shared";
import { type ApiClient } from "./client";

function dateParams(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function createCostsApi(api: ApiClient) {
  return {
    summary: (companyId: string, from?: string, to?: string) =>
      api.get<CostSummary>(`/companies/${companyId}/costs/summary${dateParams(from, to)}`),
    byAgent: (companyId: string, from?: string, to?: string) =>
      api.get<CostByAgent[]>(`/companies/${companyId}/costs/by-agent${dateParams(from, to)}`),
    byProject: (companyId: string, from?: string, to?: string) =>
      api.get<CostByProject[]>(`/companies/${companyId}/costs/by-project${dateParams(from, to)}`),
  };
}
