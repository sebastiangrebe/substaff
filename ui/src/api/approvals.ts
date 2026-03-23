import { createApprovalsApi } from "@substaff/app-core/api/approvals";
import { api } from "./client";

export const approvalsApi = createApprovalsApi(api);
