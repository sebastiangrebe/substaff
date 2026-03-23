import { createOrgChartApi } from "@substaff/app-core/api/orgChart";
import { api } from "./client";

export type {
  OrgChartNodeData,
  OrgChartNode,
  OrgChartEdge,
  OrgChartData,
} from "@substaff/app-core/api/orgChart";

export const orgChartApi = createOrgChartApi(api);
