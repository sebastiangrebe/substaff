import { createActivityApi } from "@substaff/app-core/api/activity";
import { api } from "./client";

export type { RunForIssue, IssueForRun } from "@substaff/app-core/api/activity";

export const activityApi = createActivityApi(api);
