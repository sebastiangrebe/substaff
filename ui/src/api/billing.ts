import { createBillingApi } from "@substaff/app-core/api/billing";
import { api } from "./client";

export const billingApi = createBillingApi(api);
