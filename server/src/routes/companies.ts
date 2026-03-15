import type { Db } from "@substaff/db";
import {
  companyPortabilityExportSchema,
  companyPortabilityImportSchema,
  companyPortabilityPreviewSchema,
  createCompanySchema,
  updateCompanySchema,
} from "@substaff/shared";
import { validate } from "../middleware/validate.js";
import { accessService, companyPortabilityService, companyService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, companyRouter, getActorInfo, getActorVendorId } from "./authz.js";

export function companyRoutes(db: Db) {
  const router = companyRouter();
  const svc = companyService(db);
  const portability = companyPortabilityService(db);
  const access = accessService(db);

  router.get("/", async (req, res) => {
    assertBoard(req);
    // companyIds already includes vendor-owned companies (merged in auth middleware)
    const companyIds = req.actor.companyIds ?? [];
    res.json(await svc.listByIds(companyIds));
  });

  router.get("/stats", async (req, res) => {
    assertBoard(req);
    const allowed = new Set(req.actor.companyIds ?? []);
    const stats = await svc.stats();
    const filtered = Object.fromEntries(Object.entries(stats).filter(([companyId]) => allowed.has(companyId)));
    res.json(filtered);
  });

  router.get("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const company = await svc.getById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  });

  router.get("/:companyId/org-chart", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const company = await svc.getById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company.orgChartData ?? null);
  });

  router.put("/:companyId/org-chart", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const orgChartData = req.body;
    const company = await svc.update(companyId, { orgChartData });
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.org_chart_updated",
      entityType: "company",
      entityId: companyId,
      details: { nodeCount: orgChartData?.nodes?.length ?? 0, edgeCount: orgChartData?.edges?.length ?? 0 },
    });
    res.json(company.orgChartData);
  });

  router.post("/:companyId/export", validate(companyPortabilityExportSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const result = await portability.exportBundle(companyId, req.body);
    res.json(result);
  });

  router.post("/import/preview", validate(companyPortabilityPreviewSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    } else {
      assertBoard(req);
    }
    const preview = await portability.previewImport(req.body);
    res.json(preview);
  });

  router.post("/import", validate(companyPortabilityImportSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    } else {
      assertBoard(req);
    }
    const actor = getActorInfo(req);
    const vendorId = req.actor.vendorId ?? req.actor.vendorIds?.[0];
    if (!vendorId) {
      res.status(403).json({ error: "No vendor context available" });
      return;
    }
    const result = await portability.importBundle(req.body, req.actor.type === "board" ? req.actor.userId : null, vendorId);
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.imported",
      entityType: "company",
      entityId: result.company.id,
      agentId: actor.agentId,
      runId: actor.runId,
      details: {
        include: req.body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
      },
    });
    res.json(result);
  });

  router.post("/", validate(createCompanySchema), async (req, res) => {
    assertBoard(req);
    const vendorId = getActorVendorId(req);
    const company = await svc.create({ ...req.body, vendorId });
    await access.ensureMembership(company.id, "user", req.actor.userId ?? "local-board", "owner", "active");
    await logActivity(db, {
      companyId: company.id,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      details: { name: company.name },
    });
    res.status(201).json(company);
  });

  router.patch("/:companyId", validate(updateCompanySchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const company = await svc.update(companyId, req.body);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.updated",
      entityType: "company",
      entityId: companyId,
      details: req.body,
    });
    res.json(company);
  });

  router.post("/:companyId/archive", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const company = await svc.archive(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.archived",
      entityType: "company",
      entityId: companyId,
    });
    res.json(company);
  });

  router.delete("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const company = await svc.remove(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
