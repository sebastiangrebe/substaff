import type { Approval, ApprovalComment, Issue } from "@substaff/shared";
import { type ApiClient } from "./client";

export function createApprovalsApi(api: ApiClient) {
  return {
    list: (companyId: string, status?: string) =>
      api.get<Approval[]>(
        `/companies/${companyId}/approvals${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
    create: (companyId: string, data: Record<string, unknown>) =>
      api.post<Approval>(`/companies/${companyId}/approvals`, data),
    get: (id: string) => api.get<Approval>(`/approvals/${id}`),
    approve: (id: string, decisionNote?: string) =>
      api.post<Approval>(`/approvals/${id}/approve`, { decisionNote }),
    reject: (id: string, decisionNote?: string) =>
      api.post<Approval>(`/approvals/${id}/reject`, { decisionNote }),
    requestRevision: (id: string, decisionNote?: string) =>
      api.post<Approval>(`/approvals/${id}/request-revision`, { decisionNote }),
    resubmit: (id: string, payload?: Record<string, unknown>) =>
      api.post<Approval>(`/approvals/${id}/resubmit`, { payload }),
    listComments: (id: string) => api.get<ApprovalComment[]>(`/comments/approval/${id}`),
    addComment: (id: string, body: string) =>
      api.post<ApprovalComment>(`/comments/approval/${id}`, { body }),
    listIssues: (id: string) => api.get<Issue[]>(`/approvals/${id}/issues`),
  };
}
