import { createPlansApi } from "@substaff/app-core/api/plans";
import { api } from "./client";

export type { TaskPlanWithIssue } from "@substaff/app-core/api/plans";

export const plansApi = createPlansApi(api);
