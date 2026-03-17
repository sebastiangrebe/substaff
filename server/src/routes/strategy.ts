import type { Db } from "@substaff/db";
import {
  createObjectiveSchema,
  updateObjectiveSchema,
  createKeyResultSchema,
  updateKeyResultSchema,
  createKpiEntrySchema,
} from "@substaff/shared";
import { validate } from "../middleware/validate.js";
import { strategyService, logActivity } from "../services/index.js";
import { assertCompanyAccess, companyRouter, getActorInfo } from "./authz.js";

export function strategyRoutes(db: Db) {
  const router = companyRouter();
  const svc = strategyService(db);

  // ── Objectives ──────────────────────────────────────────────────

  router.get("/companies/:companyId/objectives", async (req, res) => {
    const companyId = req.params.companyId as string;
    const result = await svc.listObjectives(companyId);
    res.json(result);
  });

  router.get("/companies/:companyId/objectives/summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    const result = await svc.listObjectivesWithProgress(companyId);
    res.json(result);
  });

  router.post("/companies/:companyId/objectives", validate(createObjectiveSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const objective = await svc.createObjective(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "objective.created",
      entityType: "objective",
      entityId: objective.id,
      details: { title: objective.title },
    });
    res.status(201).json(objective);
  });

  router.get("/objectives/:id", async (req, res) => {
    const id = req.params.id as string;
    const objective = await svc.getObjectiveById(id);
    if (!objective) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }
    assertCompanyAccess(req, objective.companyId);
    res.json(objective);
  });

  router.get("/objectives/:id/details", async (req, res) => {
    const id = req.params.id as string;
    const result = await svc.getObjectiveWithKeyResults(id);
    if (!result) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }
    assertCompanyAccess(req, result.companyId);
    res.json(result);
  });

  router.patch("/objectives/:id", validate(updateObjectiveSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getObjectiveById(id);
    if (!existing) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const objective = await svc.updateObjective(id, req.body);
    if (!objective) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: objective.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "objective.updated",
      entityType: "objective",
      entityId: objective.id,
      details: req.body,
    });
    res.json(objective);
  });

  router.delete("/objectives/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getObjectiveById(id);
    if (!existing) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const objective = await svc.removeObjective(id);
    if (!objective) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: objective.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "objective.deleted",
      entityType: "objective",
      entityId: objective.id,
    });
    res.json(objective);
  });

  // ── Key Results ─────────────────────────────────────────────────

  router.get("/objectives/:objectiveId/key-results", async (req, res) => {
    const objectiveId = req.params.objectiveId as string;
    const objective = await svc.getObjectiveById(objectiveId);
    if (!objective) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }
    assertCompanyAccess(req, objective.companyId);
    const result = await svc.listKeyResults(objectiveId);
    res.json(result);
  });

  router.post("/companies/:companyId/key-results", validate(createKeyResultSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const kr = await svc.createKeyResult(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "key_result.created",
      entityType: "key_result",
      entityId: kr.id,
      details: { title: kr.title },
    });
    res.status(201).json(kr);
  });

  router.get("/key-results/:id", async (req, res) => {
    const id = req.params.id as string;
    const kr = await svc.getKeyResultById(id);
    if (!kr) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    assertCompanyAccess(req, kr.companyId);
    res.json(kr);
  });

  router.patch("/key-results/:id", validate(updateKeyResultSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getKeyResultById(id);
    if (!existing) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const kr = await svc.updateKeyResult(id, req.body);
    if (!kr) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: kr.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "key_result.updated",
      entityType: "key_result",
      entityId: kr.id,
      details: req.body,
    });
    res.json(kr);
  });

  router.delete("/key-results/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getKeyResultById(id);
    if (!existing) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const kr = await svc.removeKeyResult(id);
    if (!kr) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: kr.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "key_result.deleted",
      entityType: "key_result",
      entityId: kr.id,
    });
    res.json(kr);
  });

  // ── KPI Entries ─────────────────────────────────────────────────

  router.get("/key-results/:keyResultId/entries", async (req, res) => {
    const keyResultId = req.params.keyResultId as string;
    const kr = await svc.getKeyResultById(keyResultId);
    if (!kr) {
      res.status(404).json({ error: "Key result not found" });
      return;
    }
    assertCompanyAccess(req, kr.companyId);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const since = req.query.since ? String(req.query.since) : undefined;
    const result = await svc.listKpiEntries(keyResultId, { limit, since });
    res.json(result);
  });

  router.post("/companies/:companyId/kpi-entries", validate(createKpiEntrySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const actor = getActorInfo(req);
    const entry = await svc.createKpiEntry(companyId, {
      ...req.body,
      sourceAgentId: actor.agentId ?? null,
      sourceUserId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "kpi_entry.reported",
      entityType: "kpi_entry",
      entityId: entry.id,
      details: { keyResultId: req.body.keyResultId, value: req.body.value },
    });
    res.status(201).json(entry);
  });

  return router;
}
