import { createIntegrationsApi } from "@substaff/app-core/api/integrations";
import { api } from "./client";

export const integrationsApi = createIntegrationsApi(api);
