import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { companies, agents } from "@substaff/db";
import { getBuiltinTemplates, getBuiltinTemplateById } from "../services/org-templates.js";
import { assertBoard, companyRouter, getActorInfo } from "./authz.js";
import { logActivity } from "../services/index.js";

export function templateRoutes(db: Db) {
  const router = companyRouter();

  // GET /api/templates — list all available org templates
  router.get("/templates", async (_req, res) => {
    const templates = getBuiltinTemplates();
    res.json({ templates });
  });

  // GET /api/templates/:templateId — get a specific template
  router.get("/templates/:templateId", async (req, res) => {
    const { templateId } = req.params;
    const template = getBuiltinTemplateById(templateId!);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({ template });
  });

  // POST /api/companies/:companyId/apply-template — apply a template to a company
  router.post("/companies/:companyId/apply-template", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;

    const { templateId, createAgents } = req.body as {
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

    // Optionally create agents from template nodes
    let createdAgents: Array<typeof agents.$inferSelect> = [];
    if (createAgents) {
      const agentValues = template.nodes.map((node) => ({
        companyId,
        name: node.data.label,
        role: node.data.role,
        title: node.data.title,
        capabilities: node.data.capabilities,
        status: "idle" as const,
      }));

      createdAgents = await db.insert(agents).values(agentValues).returning();
    }

    const actor = getActorInfo(req);
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
        createAgents: !!createAgents,
        agentCount: createdAgents.length,
      },
    });

    res.json({
      company: updated,
      agents: createdAgents,
      template: { id: template.id, name: template.name },
    });
  });

  return router;
}
