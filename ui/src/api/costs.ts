import { createCostsApi } from "@substaff/app-core/api/costs";
import { api } from "./client";

export const costsApi = createCostsApi(api);
