import { Router } from "express";
import type { Db } from "@substaff/db";
import { projectStateService } from "../services/project-state.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { logActivity } from "../services/index.js";

export function projectStateRoutes(db: Db) {
  const router = Router();
  const svc = projectStateService(db);

  // GET /api/companies/:companyId/projects/:projectId/state — get latest project state
  router.get("/:companyId/projects/:projectId/state", async (req, res) => {
    const { companyId, projectId } = req.params;
    assertCompanyAccess(req, companyId!);

    const state = await svc.get(projectId!, companyId!);
    res.json({ state });
  });

  // GET /api/companies/:companyId/projects/:projectId/state/versions — list all versions
  router.get("/:companyId/projects/:projectId/state/versions", async (req, res) => {
    const { companyId, projectId } = req.params;
    assertCompanyAccess(req, companyId!);

    const versions = await svc.listVersions(projectId!, companyId!);
    res.json({ versions });
  });

  // PUT /api/companies/:companyId/projects/:projectId/state — update project state
  router.put("/:companyId/projects/:projectId/state", async (req, res) => {
    const { companyId, projectId } = req.params;
    assertCompanyAccess(req, companyId!);
    const actor = getActorInfo(req);

    const { stateJson, stateMarkdown } = req.body as {
      stateJson?: Record<string, unknown>;
      stateMarkdown?: string;
    };

    const state = await svc.upsert({
      projectId: projectId!,
      companyId: companyId!,
      stateJson: stateJson ?? null,
      stateMarkdown: stateMarkdown ?? null,
      updatedByAgentId: actor.agentId,
    });

    await logActivity(db, {
      companyId: companyId!,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "project_state.updated",
      entityType: "project",
      entityId: projectId!,
      agentId: actor.agentId,
      runId: actor.runId,
      details: { version: state.version },
    });

    res.json({ state });
  });

  return router;
}
