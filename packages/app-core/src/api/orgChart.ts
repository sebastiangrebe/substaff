import { type ApiClient } from "./client";

export interface OrgChartNodeData {
  name: string;
  role: string;
  adapterType: string;
}

export interface OrgChartNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: OrgChartNodeData;
}

export interface OrgChartEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface OrgChartData {
  nodes: OrgChartNode[];
  edges: OrgChartEdge[];
  promptToOrg?: string;
}

export function createOrgChartApi(api: ApiClient) {
  return {
    get: (companyId: string) =>
      api.get<OrgChartData | null>(`/companies/${companyId}/org-chart`),
    save: (companyId: string, data: OrgChartData) =>
      api.put<OrgChartData>(`/companies/${companyId}/org-chart`, data),
  };
}
