import { createTemplatesApi } from "@substaff/app-core/api/templates";
import { api } from "./client";

export type { OrgTemplateDetail, ApplyTemplateResult } from "@substaff/app-core/api/templates";

export const templatesApi = createTemplatesApi(api);
