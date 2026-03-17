/**
 * Built-in org chart templates library.
 *
 * Delegates to the YAML-based company templates in companies/templates/.
 * Each template is converted to the React Flow node/edge format expected
 * by the org chart UI.
 */

import type { AgentRole } from "@substaff/shared";
import { AGENT_ROLES, classifyBuiltinRole } from "@substaff/shared";
import { loadCompanyTemplates, loadCompanyTemplateBySlug } from "./template-loader.js";
import type { CompanyTemplate } from "./template-loader.js";

export interface OrgTemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    role: AgentRole;
    title: string;
    capabilities: string;
  };
}

export interface OrgTemplateEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
}

export interface OrgTemplateDefinition {
  id: string;
  name: string;
  description: string;
  industry: string;
  icon?: string;
  nodes: OrgTemplateNode[];
  edges: OrgTemplateEdge[];
  bootstrapGoal?: { title: string; description: string };
}

/** Map a role slug from the template YAML to the closest valid AgentRole. */
function mapToAgentRole(roleSlug: string): AgentRole {
  // Direct match
  if ((AGENT_ROLES as readonly string[]).includes(roleSlug)) {
    return roleSlug as AgentRole;
  }

  // Classification-based mapping
  const classification = classifyBuiltinRole(roleSlug);
  if (classification === "leadership") return "manager";

  // Keyword-based fallback
  const lower = roleSlug.toLowerCase();
  if (lower.includes("engineer") || lower.includes("developer") || lower.includes("architect")) return "engineer";
  if (lower.includes("design")) return "designer";
  if (lower.includes("test") || lower.includes("qa") || lower.includes("audit")) return "qa";
  if (lower.includes("devops") || lower.includes("sre") || lower.includes("infrastructure")) return "devops";
  if (lower.includes("research")) return "researcher";
  if (lower.includes("writer") || lower.includes("content") || lower.includes("creator")) return "creator";
  if (lower.includes("analyst") || lower.includes("analytics")) return "analyst";
  if (lower.includes("support") || lower.includes("responder")) return "support";
  if (lower.includes("manager") || lower.includes("director") || lower.includes("lead") || lower.includes("head")) return "manager";
  if (lower.includes("producer") || lower.includes("project") || lower.includes("shepherd")) return "pm";
  if (lower.includes("strategist") || lower.includes("specialist")) return "specialist";

  return "general";
}

/** Compute tree-layout positions for agents based on reporting hierarchy. */
function layoutNodes(agents: CompanyTemplate["agents"]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const childrenOf = new Map<string, string[]>();

  // Build children map
  for (const a of agents) {
    const parent = a.reportsTo ?? "__root__";
    const children = childrenOf.get(parent) ?? [];
    children.push(a.id);
    childrenOf.set(parent, children);
  }

  // BFS to assign positions
  const roots = agents.filter((a) => !a.reportsTo).map((a) => a.id);
  const queue: Array<{ id: string; depth: number }> = roots.map((id) => ({ id, depth: 0 }));
  const depthBuckets = new Map<number, string[]>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const bucket = depthBuckets.get(depth) ?? [];
    bucket.push(id);
    depthBuckets.set(depth, bucket);

    const children = childrenOf.get(id) ?? [];
    for (const childId of children) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }

  for (const [depth, ids] of depthBuckets) {
    const totalWidth = (ids.length - 1) * 200;
    const startX = 300 - totalWidth / 2;
    for (let i = 0; i < ids.length; i++) {
      positions.set(ids[i], { x: startX + i * 200, y: depth * 150 });
    }
  }

  return positions;
}

/** Convert a CompanyTemplate to an OrgTemplateDefinition */
function templateToDefinition(template: CompanyTemplate): OrgTemplateDefinition {
  const positions = layoutNodes(template.agents);

  const nodes: OrgTemplateNode[] = template.agents.map((agent) => ({
    id: agent.id,
    type: "default",
    position: positions.get(agent.id) ?? { x: 0, y: 0 },
    data: {
      label: agent.name,
      role: mapToAgentRole(agent.role),
      title: agent.title,
      capabilities: "",
    },
  }));

  const edges: OrgTemplateEdge[] = template.agents
    .filter((a) => a.reportsTo)
    .map((a) => ({
      id: `${a.reportsTo}-${a.id}`,
      source: a.reportsTo!,
      target: a.id,
      label: "reports to",
    }));

  return {
    id: template.slug,
    name: template.name,
    description: template.description,
    industry: template.industry,
    icon: template.icon,
    nodes,
    edges,
    bootstrapGoal: template.bootstrapGoal,
  };
}

export function getBuiltinTemplates(): OrgTemplateDefinition[] {
  return loadCompanyTemplates().map(templateToDefinition);
}

export function getBuiltinTemplateById(id: string): OrgTemplateDefinition | undefined {
  const template = loadCompanyTemplateBySlug(id);
  return template ? templateToDefinition(template) : undefined;
}
