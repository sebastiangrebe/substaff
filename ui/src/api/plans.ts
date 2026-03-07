import type { TaskPlan } from "@substaff/shared";
import { api } from "./client";

export type TaskPlanWithIssue = TaskPlan & { issueTitle: string; issueIdentifier: string | null };

export const plansApi = {
  list: (companyId: string, issueId: string) =>
    api
      .get<{ plans: TaskPlan[] }>(`/companies/${companyId}/issues/${issueId}/plans`)
      .then((res) => res.plans),
  listByCompany: (companyId: string, status?: string) =>
    api
      .get<{ plans: TaskPlanWithIssue[] }>(`/companies/${companyId}/plans${status ? `?status=${status}` : ""}`)
      .then((res) => res.plans),
  create: (companyId: string, issueId: string, data: { planMarkdown: string; agentId: string }) =>
    api
      .post<{ plan: TaskPlan }>(`/companies/${companyId}/issues/${issueId}/plans`, data)
      .then((res) => res.plan),
  approve: (companyId: string, planId: string) =>
    api
      .post<{ plan: TaskPlan }>(`/companies/${companyId}/plans/${planId}/approve`, {})
      .then((res) => res.plan),
  reject: (companyId: string, planId: string, comments?: string) =>
    api
      .post<{ plan: TaskPlan }>(`/companies/${companyId}/plans/${planId}/reject`, { comments })
      .then((res) => res.plan),
};
