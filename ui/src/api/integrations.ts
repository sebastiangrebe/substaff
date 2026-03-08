import type {
  McpServerDefinition,
  IntegrationConnectionWithDefinition,
} from "@substaff/shared";
import { api } from "./client";

export const integrationsApi = {
  definitions: (companyId: string) =>
    api.get<McpServerDefinition[]>(`/companies/${companyId}/integrations/definitions`),

  list: (companyId: string) =>
    api.get<IntegrationConnectionWithDefinition[]>(`/companies/${companyId}/integrations`),

  connect: (
    companyId: string,
    data: {
      definitionId: string;
      credentialSecretIds: Record<string, string>;
      config?: Record<string, unknown>;
    },
  ) =>
    api.post<IntegrationConnectionWithDefinition>(
      `/companies/${companyId}/integrations`,
      data,
    ),

  update: (
    connectionId: string,
    data: {
      credentialSecretIds?: Record<string, string>;
      config?: Record<string, unknown>;
      status?: string;
    },
  ) => api.patch<IntegrationConnectionWithDefinition>(`/integrations/${connectionId}`, data),

  disconnect: (connectionId: string) =>
    api.delete<{ ok: true }>(`/integrations/${connectionId}`),

  oauthAvailable: (slug: string) =>
    api.get<{ available: boolean }>(`/integrations/oauth/${slug}/available`),

  /** Returns the URL to redirect to for OAuth authorization */
  oauthAuthorizeUrl: (slug: string, companyId: string) =>
    `/api/integrations/oauth/${slug}/authorize?companyId=${encodeURIComponent(companyId)}`,
};
