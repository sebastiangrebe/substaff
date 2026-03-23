import { createStrategyApi } from "@substaff/app-core/api/strategy";
import { api } from "./client";

export const strategyApi = createStrategyApi(api);
