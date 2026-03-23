import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { companies, agents } from "@substaff/db";
import { classifyBuiltinRole } from "@substaff/shared";
import { getBuiltinTemplates, getBuiltinTemplateById } from "../services/org-templates.js";
import { loadCompanyTemplateBySlug } from "../services/template-loader.js";
import { assertBoard, companyRouter, getActorInfo, getActorVendorId } from "./authz.js";
import { logActivity } from "../services/index.js";
import { enqueueEmailAlert } from "../queues/email-alerts.js";

export function templateRoutes(db: Db) {
  const router = companyRouter();

  // GET /api/templates — list all available org templates
  router.get("/templates", async (_req, res) => {
    const templates = getBuiltinTemplates();
    res.json({
      templates: templates.map((t) => ({
        ...t,
        agentCount: t.nodes.length,
      })),
    });
  });

  // GET /api/templates/:templateId — get a specific template
  router.get("/templates/:templateId", async (req, res) => {
    const { templateId } = req.params;
    const template = getBuiltinTemplateById(templateId!);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({
      template: {
        ...template,
        agentCount: template.nodes.length,
      },
    });
  });

  // POST /api/companies/:companyId/apply-template — apply a template to a company
  router.post("/companies/:companyId/apply-template", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;

    const { templateId, createAgents: shouldCreateAgents } = req.body as {
      templateId: string;
      createAgents?: boolean;
    };

    if (!templateId) {
      res.status(400).json({ error: "templateId is required" });
      return;
    }

    const template = getBuiltinTemplateById(templateId);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // Build orgChartData from template nodes/edges
    const orgChartData = {
      nodes: template.nodes,
      edges: template.edges,
    };

    // Update company orgChartData
    const [updated] = await db
      .update(companies)
      .set({ orgChartData, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const actor = getActorInfo(req);

    // Optionally create agents from template
    let createdAgents: Array<typeof agents.$inferSelect> = [];
    if (shouldCreateAgents) {
      // Load the YAML template for role and reportsTo info
      const yamlTemplate = loadCompanyTemplateBySlug(templateId);

      // Resolve the requesting user's ID to set as managerId on root agents
      const boardUserId = actor.actorType === "user" ? actor.actorId : null;

      // Pass 1: Create all agents
      const agentValues = template.nodes.map((node) => {
        const yamlAgent = yamlTemplate?.agents.find((a) => a.id === node.id);
        const isRoot = yamlAgent ? !yamlAgent.reportsTo : false;
        const role = node.data.role;
        const classification = classifyBuiltinRole(role);

        return {
          companyId,
          name: node.data.label,
          role,
          title: node.data.title,
          capabilities: node.data.capabilities || undefined,
          status: "idle" as const,
          adapterType: "blaxel_sandbox" as const,
          adapterConfig: {},
          // Assign the board user as manager of root agents (CEO)
          managerId: isRoot ? boardUserId : null,
          runtimeConfig: {
            heartbeat: {
              enabled: classification === "leadership",
              intervalSec: 3600,
              wakeOnDemand: true,
              cooldownSec: 10,
              maxConcurrentRuns: 1,
            },
          },
        };
      });

      createdAgents = await db.insert(agents).values(agentValues).returning();

      // Pass 2: Wire reportsTo using template edges
      if (yamlTemplate) {
        // Build templateId -> dbAgentId map
        const templateIdToDbId = new Map<string, string>();
        for (let i = 0; i < template.nodes.length; i++) {
          templateIdToDbId.set(template.nodes[i].id, createdAgents[i].id);
        }

        // Update reportsTo for each agent that has a parent
        for (const yamlAgent of yamlTemplate.agents) {
          if (!yamlAgent.reportsTo) continue;
          const dbAgentId = templateIdToDbId.get(yamlAgent.id);
          const dbParentId = templateIdToDbId.get(yamlAgent.reportsTo);
          if (dbAgentId && dbParentId) {
            await db
              .update(agents)
              .set({ reportsTo: dbParentId })
              .where(eq(agents.id, dbAgentId));
          }
        }

        // Re-fetch to get updated reportsTo values
        const agentIds = createdAgents.map((a) => a.id);
        const refreshed = [];
        for (const id of agentIds) {
          const [a] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, id));
          if (a) refreshed.push(a);
        }
        createdAgents = refreshed;
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.template_applied",
      entityType: "company",
      entityId: companyId,
      details: {
        templateId: template.id,
        templateName: template.name,
        createAgents: !!shouldCreateAgents,
        agentCount: createdAgents.length,
      },
    });

    if (shouldCreateAgents && createdAgents.length > 0) {
      enqueueEmailAlert({
        type: "onboarding-complete",
        vendorId: getActorVendorId(req),
        companyId,
        companyName: updated.name,
        agentCount: createdAgents.length,
      });
    }

    res.json({
      company: updated,
      agents: createdAgents,
      template: { id: template.id, name: template.name },
    });
  });

  return router;
}
