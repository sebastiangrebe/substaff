import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { agents, approvals, heartbeatRuns, issues, taskPlans } from "@substaff/db";
import { ACTIONABLE_APPROVAL_STATUSES, FAILED_HEARTBEAT_RUN_STATUSES, type SidebarBadges } from "@substaff/shared";

export function sidebarBadgeService(db: Db) {
  return {
    get: async (
      companyId: string,
      extra?: { joinRequests?: number; assignedIssues?: number },
    ): Promise<SidebarBadges> => {
      const actionableApprovals = await db
        .select({ count: sql<number>`count(*)` })
        .from(approvals)
        .where(
          and(
            eq(approvals.companyId, companyId),
            inArray(approvals.status, [...ACTIONABLE_APPROVAL_STATUSES]),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0));

      const latestRunByAgent = await db
        .selectDistinctOn([heartbeatRuns.agentId], {
          runStatus: heartbeatRuns.status,
        })
        .from(heartbeatRuns)
        .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            eq(agents.companyId, companyId),
            not(eq(agents.status, "terminated")),
          ),
        )
        .orderBy(heartbeatRuns.agentId, desc(heartbeatRuns.createdAt));

      const failedRuns = latestRunByAgent.filter((row) =>
        (FAILED_HEARTBEAT_RUN_STATUSES as readonly string[]).includes(row.runStatus),
      ).length;

      const pendingPlans = await db
        .select({ count: sql<number>`count(*)` })
        .from(taskPlans)
        .where(
          and(
            eq(taskPlans.companyId, companyId),
            eq(taskPlans.status, "pending_review"),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0));

      const blockedIssues = await db
        .select({ count: sql<number>`count(*)` })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "blocked"),
          ),
        )
        .then((rows) => Number(rows[0]?.count ?? 0));

      const joinRequests = extra?.joinRequests ?? 0;
      const assignedIssues = extra?.assignedIssues ?? 0;
      return {
        inbox: actionableApprovals + pendingPlans + failedRuns + joinRequests + assignedIssues + blockedIssues,
        approvals: actionableApprovals,
        pendingPlans,
        failedRuns,
        joinRequests,
        blockedIssues,
      };
    },
  };
}
