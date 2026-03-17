import { api } from "./client";

export interface OrgTemplateDetail {
  id: string;
  name: string;
  description: string;
  industry: string;
  icon?: string;
  agentCount: number;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
      label: string;
      role: string;
      title: string;
      capabilities: string;
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    label?: string;
  }>;
  bootstrapGoal?: { title: string; description: string };
}

export interface ApplyTemplateResult {
  company: unknown;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    title: string;
    reportsTo: string | null;
  }>;
  template: { id: string; name: string };
}

export const templatesApi = {
  list: () =>
    api
      .get<{ templates: OrgTemplateDetail[] }>("/templates")
      .then((res) => res.templates),

  getById: (templateId: string) =>
    api
      .get<{ template: OrgTemplateDetail }>(`/templates/${templateId}`)
      .then((res) => res.template),

  apply: (companyId: string, templateId: string, createAgents: boolean = false) =>
    api.post<ApplyTemplateResult>(
      `/companies/${companyId}/apply-template`,
      { templateId, createAgents },
    ),
};
