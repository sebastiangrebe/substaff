import { Router } from "express";
import type { Db } from "@substaff/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { issues, joinRequests } from "@substaff/db";
import { OPEN_ISSUE_STATUSES } from "@substaff/shared";
import { sidebarBadgeService } from "../services/sidebar-badges.js";
import { accessService } from "../services/access.js";
import { assertCompanyAccess } from "./authz.js";

export function sidebarBadgeRoutes(db: Db) {
  const router = Router();
  const svc = sidebarBadgeService(db);
  const access = accessService(db);

  router.get("/companies/:companyId/sidebar-badges", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    let canApproveJoins = false;
    if (req.actor.type === "board") {
      canApproveJoins =
        Boolean(req.actor.isInstanceAdmin) ||
        (await access.canUser(companyId, req.actor.userId, "joins:approve"));
    } else if (req.actor.type === "agent" && req.actor.agentId) {
      canApproveJoins = await access.hasPermission(companyId, "agent", req.actor.agentId, "joins:approve");
    }

    const joinRequestCount = canApproveJoins
      ? await db
        .select({ count: sql<number>`count(*)` })
        .from(joinRequests)
        .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.status, "pending_approval")))
        .then((rows) => Number(rows[0]?.count ?? 0))
      : 0;

    const assignedIssueCount =
      req.actor.type === "board" && req.actor.userId
        ? await db
          .select({ count: sql<number>`count(*)` })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, companyId),
              eq(issues.assigneeUserId, req.actor.userId),
              inArray(issues.status, [...OPEN_ISSUE_STATUSES]),
              isNull(issues.hiddenAt),
            ),
          )
          .then((rows) => Number(rows[0]?.count ?? 0))
        : 0;

    const badges = await svc.get(companyId, {
      joinRequests: joinRequestCount,
      assignedIssues: assignedIssueCount,
    });
    res.json(badges);
  });

  return router;
}
