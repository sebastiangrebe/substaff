import { Router } from "express";
import type { Db } from "@substaff/db";
import { connectIntegrationSchema, updateIntegrationSchema } from "@substaff/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import { integrationService } from "../services/integrations.js";

export function integrationRoutes(db: Db) {
  const router = Router();
  const svc = integrationService(db);

  // List available MCP server definitions
  router.get("/companies/:companyId/integrations/definitions", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const definitions = await svc.listDefinitions();
    res.json(definitions);
  });

  // List company's integration connections
  router.get("/companies/:companyId/integrations", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const connections = await svc.listConnections(companyId);
    res.json(connections);
  });

  // Connect a new integration
  router.post(
    "/companies/:companyId/integrations",
    validate(connectIntegrationSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const created = await svc.connectIntegration(companyId, {
        definitionId: req.body.definitionId,
        credentialSecretIds: req.body.credentialSecretIds,
        config: req.body.config,
      });

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "integration.connected",
        entityType: "integration",
        entityId: created.id,
        details: { provider: created.provider },
      });

      res.status(201).json(created);
    },
  );

  // Update an integration connection
  router.patch(
    "/integrations/:connectionId",
    validate(updateIntegrationSchema),
    async (req, res) => {
      assertBoard(req);
      const connectionId = req.params.connectionId as string;
      const existing = await svc.getConnectionById(connectionId);
      if (!existing) {
        res.status(404).json({ error: "Integration not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);

      const updated = await svc.updateConnection(connectionId, req.body);
      if (!updated) {
        res.status(404).json({ error: "Integration not found" });
        return;
      }

      await logActivity(db, {
        companyId: existing.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "integration.updated",
        entityType: "integration",
        entityId: updated.id,
        details: { provider: updated.provider, status: updated.status },
      });

      res.json(updated);
    },
  );

  // Disconnect (delete) an integration
  router.delete("/integrations/:connectionId", async (req, res) => {
    assertBoard(req);
    const connectionId = req.params.connectionId as string;
    const existing = await svc.getConnectionById(connectionId);
    if (!existing) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const removed = await svc.disconnectIntegration(connectionId);
    if (!removed) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    await logActivity(db, {
      companyId: removed.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "integration.disconnected",
      entityType: "integration",
      entityId: removed.id,
      details: { provider: removed.provider },
    });

    res.json({ ok: true });
  });

  return router;
}
