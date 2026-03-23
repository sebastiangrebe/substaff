import { createDashboardApi } from "@substaff/app-core/api/dashboard";
import { api } from "./client";

export const dashboardApi = createDashboardApi(api);
