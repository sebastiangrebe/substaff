import { Router } from "express";
import { eq, and } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { taskPlans, issues } from "@substaff/db";

export function planRoutes(db: Db) {
  const router = Router();

  // Resolve issue identifiers (e.g. "TRA-1") to UUIDs
  router.param("issueId", async (req, _res, next, rawId) => {
    try {
      if (/^[A-Z]+-\d+$/i.test(rawId)) {
        const row = await db
          .select({ id: issues.id })
          .from(issues)
          .where(eq(issues.identifier, rawId.toUpperCase()))
          .then((rows) => rows[0] ?? null);
        if (row) {
          req.params.issueId = row.id;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // GET /api/companies/:companyId/issues/:issueId/plans — list plans for an issue
  router.get("/companies/:companyId/issues/:issueId/plans", async (req, res) => {
    const { companyId, issueId } = req.params;

    const plans = await db
      .select()
      .from(taskPlans)
      .where(
        and(eq(taskPlans.companyId, companyId!), eq(taskPlans.issueId, issueId!)),
      )
      .orderBy(taskPlans.version);

    res.json({ plans });
  });

  // POST /api/companies/:companyId/issues/:issueId/plans — create a plan
  router.post("/companies/:companyId/issues/:issueId/plans", async (req, res) => {
    const { companyId, issueId } = req.params;
    const { planMarkdown, agentId } = req.body as {
      planMarkdown: string;
      agentId: string;
    };

    if (!planMarkdown || !agentId) {
      res.status(400).json({ error: "planMarkdown and agentId are required" });
      return;
    }

    const [plan] = await db
      .insert(taskPlans)
      .values({
        companyId: companyId!,
        issueId: issueId!,
        agentId,
        planMarkdown,
        status: "pending_review",
      })
      .returning();

    res.status(201).json({ plan });
  });

  // POST /api/companies/:companyId/plans/:planId/approve — approve a plan
  router.post("/companies/:companyId/plans/:planId/approve", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Only board members can approve plans" });
      return;
    }

    const { planId } = req.params;

    const [updated] = await db
      .update(taskPlans)
      .set({
        status: "approved",
        approvedByUserId: req.actor.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(taskPlans.id, planId!))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    res.json({ plan: updated });
  });

  // POST /api/companies/:companyId/plans/:planId/reject — reject a plan
  router.post("/companies/:companyId/plans/:planId/reject", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Only board members can reject plans" });
      return;
    }

    const { planId } = req.params;
    const { comments } = req.body as { comments?: string };

    const [updated] = await db
      .update(taskPlans)
      .set({
        status: "rejected",
        reviewerComments: comments ? [{ userId: req.actor.userId, comment: comments, at: new Date().toISOString() }] : undefined,
        updatedAt: new Date(),
      })
      .where(eq(taskPlans.id, planId!))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    res.json({ plan: updated });
  });

  return router;
}
