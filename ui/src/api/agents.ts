import { createAgentsApi } from "@substaff/app-core/api/agents";
import { api } from "./client";

export type {
  AgentKey,
  AdapterModel,
  ClaudeLoginResult,
  OrgNode,
  AgentHireResponse,
} from "@substaff/app-core/api/agents";

export const agentsApi = createAgentsApi(api);
