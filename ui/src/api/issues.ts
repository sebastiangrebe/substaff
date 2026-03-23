import { createIssuesApi } from "@substaff/app-core/api/issues";
import { api } from "./client";

export const issuesApi = createIssuesApi(api);
