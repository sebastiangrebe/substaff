import { eq, and } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { taskPlans, issues } from "@substaff/db";
import {
  heartbeatService,
} from "../services/index.js";
import { companyRouter } from "./authz.js";
import { logger } from "../middleware/logger.js";

export function planRoutes(db: Db) {
  const router = companyRouter();
  const heartbeat = heartbeatService(db);

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

  // GET /api/companies/:companyId/plans — list plans for a company (optionally filtered by status)
  router.get("/companies/:companyId/plans", async (req, res) => {
    const { companyId } = req.params;
    const status = req.query.status as string | undefined;

    const conditions = [eq(taskPlans.companyId, companyId!)];
    if (status) {
      conditions.push(eq(taskPlans.status, status));
    }

    const plans = await db
      .select({
        plan: taskPlans,
        issueTitle: issues.title,
        issueIdentifier: issues.identifier,
      })
      .from(taskPlans)
      .innerJoin(issues, eq(taskPlans.issueId, issues.id))
      .where(and(...conditions))
      .orderBy(taskPlans.createdAt);

    res.json({ plans: plans.map((r) => ({ ...r.plan, issueTitle: r.issueTitle, issueIdentifier: r.issueIdentifier })) });
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

    // Reject if a pending_review plan already exists for this issue
    const [existingPending] = await db
      .select({ id: taskPlans.id })
      .from(taskPlans)
      .where(and(eq(taskPlans.issueId, issueId!), eq(taskPlans.status, "pending_review")))
      .limit(1);
    if (existingPending) {
      res.status(409).json({ error: "A plan is already pending review for this task", existingPlanId: existingPending.id });
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
    const { companyId } = req.params;
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

    // Wake the assignee agent so it can proceed with the approved plan
    const issue = await db
      .select({ assigneeAgentId: issues.assigneeAgentId })
      .from(issues)
      .where(eq(issues.id, updated.issueId))
      .then((rows) => rows[0] ?? null);

    if (issue?.assigneeAgentId) {
      void heartbeat.wakeup(issue.assigneeAgentId, {
        source: "automation",
        triggerDetail: "system",
        reason: "plan_approved",
        payload: { issueId: updated.issueId, planId: updated.id },
        requestedByActorType: req.actor.type === "board" ? "user" : req.actor.type,
        requestedByActorId: req.actor.userId ?? undefined,
        contextSnapshot: {
          issueId: updated.issueId,
          taskId: updated.issueId,
          wakeReason: "plan_approved",
        },
      }).catch((err) => logger.warn({ err, agentId: issue.assigneeAgentId }, "failed to wake agent on plan approved"));
    }

    res.json({ plan: updated });
  });

  // POST /api/companies/:companyId/plans/:planId/reject — reject a plan
  router.post("/companies/:companyId/plans/:planId/reject", async (req, res) => {
    const { companyId: rejectCompanyId } = req.params;
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

    // Wake the assignee agent so it can revise the plan based on rejection comments
    const issue = await db
      .select({ assigneeAgentId: issues.assigneeAgentId })
      .from(issues)
      .where(eq(issues.id, updated.issueId))
      .then((rows) => rows[0] ?? null);

    if (issue?.assigneeAgentId) {
      void heartbeat.wakeup(issue.assigneeAgentId, {
        source: "automation",
        triggerDetail: "system",
        reason: "plan_rejected",
        payload: {
          issueId: updated.issueId,
          planId: updated.id,
          rejectionComments: comments ?? null,
        },
        requestedByActorType: req.actor.type === "board" ? "user" : req.actor.type,
        requestedByActorId: req.actor.userId ?? undefined,
        contextSnapshot: {
          issueId: updated.issueId,
          taskId: updated.issueId,
          wakeReason: "plan_rejected",
        },
      }).catch((err) => logger.warn({ err, agentId: issue.assigneeAgentId }, "failed to wake agent on plan rejected"));
    }

    res.json({ plan: updated });
  });

  return router;
}
