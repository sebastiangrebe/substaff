import { createGoalsApi } from "@substaff/app-core/api/goals";
import { api } from "./client";

export const goalsApi = createGoalsApi(api);
