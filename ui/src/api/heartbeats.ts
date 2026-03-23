import { createHeartbeatsApi } from "@substaff/app-core/api/heartbeats";
import { api } from "./client";

export type { ActiveRunForIssue, LiveRunForIssue } from "@substaff/app-core/api/heartbeats";

export const heartbeatsApi = createHeartbeatsApi(api);
