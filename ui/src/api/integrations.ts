import type {
  ComposioToolkit,
  IntegrationConnectionWithToolkit,
} from "@substaff/shared";
import { api } from "./client";

export const integrationsApi = {
  available: (companyId: string) =>
    api.get<ComposioToolkit[]>(`/companies/${companyId}/integrations/available`),

  list: (companyId: string) =>
    api.get<IntegrationConnectionWithToolkit[]>(`/companies/${companyId}/integrations`),

  connect: (
    companyId: string,
    data: { appName: string; integrationId?: string; connectionParams?: Record<string, unknown> },
  ) =>
    api.post<{
      redirectUrl: string | null;
      connectedAccountId: string | null;
      connectionStatus: string;
      requiredFields?: Array<{ name: string; displayName: string; description: string; type: string; required: boolean }>;
    }>(
      `/companies/${companyId}/integrations`,
      data,
    ),

  disconnect: (connectionId: string) =>
    api.delete<{ ok: true }>(`/integrations/${connectionId}`),
};
