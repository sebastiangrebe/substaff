import { createCompanyRolesApi } from "@substaff/app-core/api/companyRoles";
import { api } from "./client";

export const companyRolesApi = createCompanyRolesApi(api);
