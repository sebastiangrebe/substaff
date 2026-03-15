import type { Db } from "@substaff/db";
import { companies } from "@substaff/db";
import { eq } from "drizzle-orm";
import { connectIntegrationSchema, updateIntegrationSchema } from "@substaff/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, companyRouter } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import { integrationService } from "../services/integrations.js";

export function integrationRoutes(db: Db) {
  const router = companyRouter();
  const svc = integrationService(db);

  // List available toolkits from Composio (sorted by usage)
  router.get("/companies/:companyId/integrations/available", async (req, res) => {
    assertBoard(req);
    const toolkits = await svc.listToolkits();
    res.json(toolkits ?? []);
  });

  // List company's integration connections
  router.get("/companies/:companyId/integrations", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const connections = await svc.listConnections(companyId);
    res.json(connections);
  });

  // Initiate a new integration connection (returns redirect URL for OAuth)
  router.post(
    "/companies/:companyId/integrations",
    validate(connectIntegrationSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;

      try {
        const result = await svc.initiateConnection(companyId, {
          appName: req.body.appName,
          integrationId: req.body.integrationId,
          connectionParams: req.body.connectionParams,
        });

        res.status(200).json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to initiate connection";
        res.status(400).json({ error: message });
      }
    },
  );

  // Composio OAuth callback — redirects back to the UI
  router.get("/integrations/composio/callback", async (req, res) => {
    console.log("[composio callback] query params:", JSON.stringify(req.query));

    const companyId = req.query.companyId as string | undefined;
    // Composio may send the connected account ID under different param names
    const connectedAccountId =
      (req.query.connected_account_id as string) ??
      (req.query.connectedAccountId as string) ??
      (req.query.connectionId as string) ??
      undefined;

    const uiBase = process.env.SUBSTAFF_UI_URL ?? "";

    if (!companyId || !connectedAccountId) {
      res.redirect(`${uiBase}/integrations?oauth=error&message=${encodeURIComponent("Missing parameters. Received: " + Object.keys(req.query).join(", "))}`);
      return;
    }

    try {
      // Validate the caller has access to this company before completing the connection
      assertCompanyAccess(req, companyId);

      // Look up company prefix for redirect
      const [company] = await db
        .select({ issuePrefix: companies.issuePrefix })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const prefix = company?.issuePrefix;

      const created = await svc.completeConnection(companyId, connectedAccountId);

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor?.userId ?? "board",
        action: "integration.connected",
        entityType: "integration",
        entityId: created.id,
        details: { provider: created.provider, method: "composio" },
      });

      const redirectPath = prefix
        ? `${uiBase}/${prefix}/integrations`
        : `${uiBase}/integrations`;
      res.redirect(`${redirectPath}?oauth=success&provider=${encodeURIComponent(created.provider)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.redirect(`${uiBase}/integrations?oauth=error&message=${encodeURIComponent(message)}`);
    }
  });

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
