import type { Db } from "@substaff/db";
import { commentService } from "../services/comments.js";
import { issueService, goalService, approvalService, strategyService, logActivity } from "../services/index.js";
import { assertCompanyAccess, companyRouter, getActorInfo } from "./authz.js";
import { indexComment } from "../vector/index.js";
import { logger } from "../middleware/logger.js";
import { isCompact, compactComment } from "./compact.js";

/**
 * All comment types share the same path structure: /comments/{type}/{id}
 *
 * GET  /comments/:linkType/:linkId — list comments (all types)
 * POST /comments/:linkType/:linkId — add comment (approval, goal, objective here; issue in issues.ts)
 */

const ALL_LINK_TYPES = new Set(["issue", "approval", "goal", "objective"]);
const POST_LINK_TYPES = new Set(["approval", "goal", "objective"]); // issue POST lives in issues.ts

export function commentRoutes(db: Db) {
  const router = companyRouter();
  const commentSvc = commentService(db);
  const issueSvc = issueService(db);
  const goalSvc = goalService(db);
  const approvalSvc = approvalService(db);
  const strategySvc = strategyService(db);

  async function resolveEntity(
    linkType: string,
    linkId: string,
  ): Promise<{ companyId: string; projectId?: string | null } | null> {
    switch (linkType) {
      case "issue": {
        const issue = await issueSvc.getById(linkId);
        return issue ? { companyId: issue.companyId, projectId: issue.projectId } : null;
      }
      case "approval":
        return approvalSvc.getById(linkId);
      case "goal":
        return goalSvc.getById(linkId);
      case "objective":
        return strategySvc.getObjectiveById(linkId);
      default:
        return null;
    }
  }

  // GET /comments/:linkType/:linkId — works for all types including issue
  router.get("/comments/:linkType/:linkId", async (req, res) => {
    const { linkType, linkId } = req.params;
    if (!ALL_LINK_TYPES.has(linkType)) {
      res.status(400).json({ error: `Invalid link type: ${linkType}` });
      return;
    }
    const entity = await resolveEntity(linkType, linkId);
    if (!entity) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCompanyAccess(req, entity.companyId);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const since = req.query.since as string | undefined;
    const result = await commentSvc.list(linkType, linkId, {
      limit: limit && !isNaN(limit) ? limit : undefined,
      since,
    });
    res.json(isCompact(req) ? result.map((c: any) => compactComment(c)) : result);
  });

  // GET /comments/:linkType/:linkId/:commentId — single comment by ID
  router.get("/comments/:linkType/:linkId/:commentId", async (req, res) => {
    const { linkType, linkId, commentId } = req.params;
    if (!ALL_LINK_TYPES.has(linkType)) {
      res.status(400).json({ error: `Invalid link type: ${linkType}` });
      return;
    }
    const entity = await resolveEntity(linkType, linkId);
    if (!entity) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCompanyAccess(req, entity.companyId);
    const comment = await commentSvc.getById(commentId);
    if (!comment || comment.linkId !== linkId) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    res.json(comment);
  });

  // POST /comments/:linkType/:linkId — for non-issue types
  // Issue POST is in issues.ts (same path, mounted earlier, supports reopen/interrupt/wakeup)
  router.post("/comments/:linkType/:linkId", async (req, res) => {
    const { linkType, linkId } = req.params;
    if (!POST_LINK_TYPES.has(linkType)) {
      res.status(400).json({ error: `Invalid link type: ${linkType}` });
      return;
    }
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    const entity = await resolveEntity(linkType, linkId);
    if (!entity) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCompanyAccess(req, entity.companyId);
    const actor = getActorInfo(req);
    const comment = await commentSvc.add(entity.companyId, linkType, linkId, body, {
      agentId: actor.agentId ?? undefined,
      userId: actor.actorType === "user" ? actor.actorId : undefined,
    });

    await logActivity(db, {
      companyId: entity.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: `${linkType}.comment_added`,
      entityType: linkType,
      entityId: linkId,
      details: { commentId: comment.id, bodySnippet: body.slice(0, 200) },
    });

    // Index agent comments into vector DB for knowledge search
    if (actor.agentId) {
      void indexComment(body, {
        companyId: entity.companyId,
        agentId: actor.agentId,
        linkType,
        linkId,
        commentId: comment.id,
        projectId: entity.projectId,
        runId: actor.runId,
      }).catch((err) => logger.warn({ err, commentId: comment.id }, "Failed to index comment"));
    }

    res.status(201).json(comment);
  });

  return router;
}
