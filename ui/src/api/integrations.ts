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
    data: { appName: string; integrationId?: string },
  ) =>
    api.post<{ redirectUrl: string | null; connectedAccountId: string; connectionStatus: string }>(
      `/companies/${companyId}/integrations`,
      data,
    ),

  disconnect: (connectionId: string) =>
    api.delete<{ ok: true }>(`/integrations/${connectionId}`),
};
