import type { RoleListItem } from "@substaff/shared";
import { api } from "./client";

export const companyRolesApi = {
  list: (companyId: string) => api.get<RoleListItem[]>(`/companies/${companyId}/roles`),
  create: (companyId: string, data: { slug: string; displayLabel: string; description?: string | null; classification?: string }) =>
    api.post<RoleListItem>(`/companies/${companyId}/roles`, data),
  update: (companyId: string, roleId: string, data: { displayLabel?: string; description?: string | null; classification?: string }) =>
    api.patch<RoleListItem>(`/companies/${companyId}/roles/${roleId}`, data),
  remove: (companyId: string, roleId: string) =>
    api.delete<{ ok: true }>(`/companies/${companyId}/roles/${roleId}`),
};
