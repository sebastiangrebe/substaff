import type { Objective, KeyResult, KpiEntry, ObjectiveWithKeyResults } from "@substaff/shared";
import { type ApiClient } from "./client";

export function createStrategyApi(api: ApiClient) {
  return {
    // Objectives
    listObjectives: (companyId: string) =>
      api.get<Objective[]>(`/companies/${companyId}/objectives`),
    listObjectivesSummary: (companyId: string) =>
      api.get<(Objective & { keyResultCount: number; overallProgressPercent: number })[]>(
        `/companies/${companyId}/objectives/summary`,
      ),
    getObjective: (id: string) => api.get<Objective>(`/objectives/${id}`),
    getObjectiveDetails: (id: string) =>
      api.get<ObjectiveWithKeyResults>(`/objectives/${id}/details`),
    createObjective: (companyId: string, data: Record<string, unknown>) =>
      api.post<Objective>(`/companies/${companyId}/objectives`, data),
    updateObjective: (id: string, data: Record<string, unknown>) =>
      api.patch<Objective>(`/objectives/${id}`, data),
    removeObjective: (id: string) => api.delete<Objective>(`/objectives/${id}`),

    // Key Results
    listKeyResults: (objectiveId: string) =>
      api.get<KeyResult[]>(`/objectives/${objectiveId}/key-results`),
    getKeyResult: (id: string) => api.get<KeyResult>(`/key-results/${id}`),
    createKeyResult: (companyId: string, data: Record<string, unknown>) =>
      api.post<KeyResult>(`/companies/${companyId}/key-results`, data),
    updateKeyResult: (id: string, data: Record<string, unknown>) =>
      api.patch<KeyResult>(`/key-results/${id}`, data),
    removeKeyResult: (id: string) => api.delete<KeyResult>(`/key-results/${id}`),

    // KPI Entries
    listKpiEntries: (keyResultId: string, opts?: { limit?: number; since?: string }) => {
      const params = new URLSearchParams();
      if (opts?.limit) params.set("limit", String(opts.limit));
      if (opts?.since) params.set("since", opts.since);
      const qs = params.toString();
      return api.get<KpiEntry[]>(`/key-results/${keyResultId}/entries${qs ? `?${qs}` : ""}`);
    },
    createKpiEntry: (companyId: string, data: Record<string, unknown>) =>
      api.post<KpiEntry>(`/companies/${companyId}/kpi-entries`, data),
  };
}
