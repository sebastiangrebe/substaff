import type { Goal, GoalProgress } from "@substaff/shared";
import { type ApiClient } from "./client";

export function createGoalsApi(api: ApiClient) {
  return {
    list: (companyId: string) => api.get<Goal[]>(`/companies/${companyId}/goals`),
    get: (id: string) => api.get<Goal>(`/goals/${id}`),
    create: (companyId: string, data: Record<string, unknown>) =>
      api.post<Goal>(`/companies/${companyId}/goals`, data),
    update: (id: string, data: Record<string, unknown>) => api.patch<Goal>(`/goals/${id}`, data),
    remove: (id: string) => api.delete<Goal>(`/goals/${id}`),
    progress: (id: string) => api.get<GoalProgress>(`/goals/${id}/progress`),
  };
}
