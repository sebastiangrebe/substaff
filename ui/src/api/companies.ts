import { createCompaniesApi } from "@substaff/app-core/api/companies";
import { api } from "./client";

export type { CompanyStats } from "@substaff/app-core/api/companies";

export const companiesApi = createCompaniesApi(api);
