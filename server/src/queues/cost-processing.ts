import { Queue, Worker } from "bullmq";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { agents, companies, costEvents, goals, issues, projects, vendors, creditTransactions } from "@substaff/db";
import { logger } from "../middleware/logger.js";

export const COST_PROCESSING_QUEUE = "cost-processing";

export interface CostProcessingJobData {
  costEventId: string;
  vendorId: string;
  companyId: string;
  agentId: string;
  rawCostCents: number;
  issueId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
}

let queue: Queue | null = null;

export function getCostProcessingQueue(): Queue | null {
  return queue;
}

export function initCostProcessingQueue(redisUrl: string) {
  queue = new Queue(COST_PROCESSING_QUEUE, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
  return queue;
}

export function enqueueCostProcessing(data: CostProcessingJobData) {
  if (!queue) {
    logger.warn("Cost processing queue not initialized — processing inline");
    return null;
  }
  return queue.add("process-cost", data);
}

export function createCostProcessingWorker(redisUrl: string, db: Db) {
  const worker = new Worker(
    COST_PROCESSING_QUEUE,
    async (job) => {
      const { costEventId, vendorId, companyId, agentId, rawCostCents, issueId, projectId, goalId } =
        job.data as CostProcessingJobData;

      // 1. Look up vendor markup factor
      const [vendor] = await db
        .select({
          markupBasisPoints: vendors.markupBasisPoints,
          creditBalanceCents: vendors.creditBalanceCents,
          lowBalanceAlertCents: vendors.lowBalanceAlertCents,
        })
        .from(vendors)
        .where(eq(vendors.id, vendorId));

      if (!vendor) {
        logger.error({ vendorId, costEventId }, "Vendor not found for cost processing");
        return;
      }

      // 2. Compute platform cost with markup
      const platformCostCents = Math.round(
        (rawCostCents * vendor.markupBasisPoints) / 10000,
      );

      // 3. Update cost event with platform cost
      await db
        .update(costEvents)
        .set({ platformCostCents })
        .where(eq(costEvents.id, costEventId));

      // 4. Atomically decrement vendor credit balance
      const [updatedVendor] = await db
        .update(vendors)
        .set({
          creditBalanceCents: sql`${vendors.creditBalanceCents} - ${platformCostCents}`,
          updatedAt: new Date(),
        })
        .where(eq(vendors.id, vendorId))
        .returning({ creditBalanceCents: vendors.creditBalanceCents });

      // 5. Insert credit transaction for audit trail
      await db.insert(creditTransactions).values({
        vendorId,
        type: "usage_deduction",
        amountCents: -platformCostCents,
        balanceAfterCents: updatedVendor?.creditBalanceCents ?? 0,
        costEventId,
        description: `Agent run cost (${rawCostCents}¢ LLM × markup → ${platformCostCents}¢)`,
      });

      // 6. Increment agent and company monthly + total spend
      await db
        .update(agents)
        .set({
          spentMonthlyCents: sql`${agents.spentMonthlyCents} + ${rawCostCents}`,
          platformSpentMonthlyCents: sql`${agents.platformSpentMonthlyCents} + ${platformCostCents}`,
          spentTotalCents: sql`${agents.spentTotalCents} + ${rawCostCents}`,
          platformSpentTotalCents: sql`${agents.platformSpentTotalCents} + ${platformCostCents}`,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agentId));

      await db
        .update(companies)
        .set({
          spentMonthlyCents: sql`${companies.spentMonthlyCents} + ${rawCostCents}`,
          platformSpentMonthlyCents: sql`${companies.platformSpentMonthlyCents} + ${platformCostCents}`,
          spentTotalCents: sql`${companies.spentTotalCents} + ${rawCostCents}`,
          platformSpentTotalCents: sql`${companies.platformSpentTotalCents} + ${platformCostCents}`,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));

      // 6b. Increment entity-level spend (issue, project, goal)
      if (issueId) {
        await db
          .update(issues)
          .set({
            spentMonthlyCents: sql`${issues.spentMonthlyCents} + ${rawCostCents}`,
            platformSpentMonthlyCents: sql`${issues.platformSpentMonthlyCents} + ${platformCostCents}`,
            spentTotalCents: sql`${issues.spentTotalCents} + ${rawCostCents}`,
            platformSpentTotalCents: sql`${issues.platformSpentTotalCents} + ${platformCostCents}`,
            updatedAt: new Date(),
          })
          .where(eq(issues.id, issueId));
      }

      if (projectId) {
        await db
          .update(projects)
          .set({
            spentMonthlyCents: sql`${projects.spentMonthlyCents} + ${rawCostCents}`,
            platformSpentMonthlyCents: sql`${projects.platformSpentMonthlyCents} + ${platformCostCents}`,
            spentTotalCents: sql`${projects.spentTotalCents} + ${rawCostCents}`,
            platformSpentTotalCents: sql`${projects.platformSpentTotalCents} + ${platformCostCents}`,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId));
      }

      if (goalId) {
        await db
          .update(goals)
          .set({
            spentMonthlyCents: sql`${goals.spentMonthlyCents} + ${rawCostCents}`,
            platformSpentMonthlyCents: sql`${goals.platformSpentMonthlyCents} + ${platformCostCents}`,
            spentTotalCents: sql`${goals.spentTotalCents} + ${rawCostCents}`,
            platformSpentTotalCents: sql`${goals.platformSpentTotalCents} + ${platformCostCents}`,
            updatedAt: new Date(),
          })
          .where(eq(goals.id, goalId));
      }

      // 7. Budget enforcement — check all levels, pause agent if any exceeded
      let shouldPause = false;
      let pauseReason = "";

      // Check issue budget
      if (issueId) {
        const [issue] = await db
          .select({
            budgetMonthlyCents: issues.budgetMonthlyCents,
            spentMonthlyCents: issues.spentMonthlyCents,
            budgetTotalCents: issues.budgetTotalCents,
            spentTotalCents: issues.spentTotalCents,
          })
          .from(issues)
          .where(eq(issues.id, issueId));

        if (issue) {
          if (issue.budgetMonthlyCents > 0 && issue.spentMonthlyCents >= issue.budgetMonthlyCents) {
            shouldPause = true;
            pauseReason = "issue monthly budget exceeded";
          }
          if (issue.budgetTotalCents > 0 && issue.spentTotalCents >= issue.budgetTotalCents) {
            shouldPause = true;
            pauseReason = "issue total budget exceeded";
          }
        }
      }

      // Check project budget
      if (!shouldPause && projectId) {
        const [project] = await db
          .select({
            budgetMonthlyCents: projects.budgetMonthlyCents,
            spentMonthlyCents: projects.spentMonthlyCents,
            budgetTotalCents: projects.budgetTotalCents,
            spentTotalCents: projects.spentTotalCents,
          })
          .from(projects)
          .where(eq(projects.id, projectId));

        if (project) {
          if (project.budgetMonthlyCents > 0 && project.spentMonthlyCents >= project.budgetMonthlyCents) {
            shouldPause = true;
            pauseReason = "project monthly budget exceeded";
          }
          if (project.budgetTotalCents > 0 && project.spentTotalCents >= project.budgetTotalCents) {
            shouldPause = true;
            pauseReason = "project total budget exceeded";
          }
        }
      }

      // Check goal budget
      if (!shouldPause && goalId) {
        const [goal] = await db
          .select({
            budgetMonthlyCents: goals.budgetMonthlyCents,
            spentMonthlyCents: goals.spentMonthlyCents,
            budgetTotalCents: goals.budgetTotalCents,
            spentTotalCents: goals.spentTotalCents,
          })
          .from(goals)
          .where(eq(goals.id, goalId));

        if (goal) {
          if (goal.budgetMonthlyCents > 0 && goal.spentMonthlyCents >= goal.budgetMonthlyCents) {
            shouldPause = true;
            pauseReason = "goal monthly budget exceeded";
          }
          if (goal.budgetTotalCents > 0 && goal.spentTotalCents >= goal.budgetTotalCents) {
            shouldPause = true;
            pauseReason = "goal total budget exceeded";
          }
        }
      }

      // Check agent budget (monthly + total)
      const [agent] = await db
        .select({
          budgetMonthlyCents: agents.budgetMonthlyCents,
          spentMonthlyCents: agents.spentMonthlyCents,
          budgetTotalCents: agents.budgetTotalCents,
          spentTotalCents: agents.spentTotalCents,
          status: agents.status,
        })
        .from(agents)
        .where(eq(agents.id, agentId));

      if (agent && !shouldPause) {
        if (agent.budgetMonthlyCents > 0 && agent.spentMonthlyCents >= agent.budgetMonthlyCents) {
          shouldPause = true;
          pauseReason = "agent monthly budget exceeded";
        }
        if (agent.budgetTotalCents > 0 && agent.spentTotalCents >= agent.budgetTotalCents) {
          shouldPause = true;
          pauseReason = "agent total budget exceeded";
        }
      }

      // Check company budget (monthly + total)
      if (!shouldPause) {
        const [company] = await db
          .select({
            budgetMonthlyCents: companies.budgetMonthlyCents,
            spentMonthlyCents: companies.spentMonthlyCents,
            budgetTotalCents: companies.budgetTotalCents,
            spentTotalCents: companies.spentTotalCents,
          })
          .from(companies)
          .where(eq(companies.id, companyId));

        if (company) {
          if (company.budgetMonthlyCents > 0 && company.spentMonthlyCents >= company.budgetMonthlyCents) {
            shouldPause = true;
            pauseReason = "company monthly budget exceeded";
          }
          if (company.budgetTotalCents > 0 && company.spentTotalCents >= company.budgetTotalCents) {
            shouldPause = true;
            pauseReason = "company total budget exceeded";
          }
        }
      }

      if (
        shouldPause &&
        agent &&
        agent.status !== "paused" &&
        agent.status !== "terminated"
      ) {
        await db
          .update(agents)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(agents.id, agentId));

        logger.info(
          { agentId, reason: pauseReason },
          "Agent paused — budget exceeded",
        );

        const { enqueueEmailAlert } = await import("./email-alerts.js");
        await enqueueEmailAlert({
          type: "agent-budget-reached",
          vendorId,
          companyId,
          agentId,
          budgetCents: agent.budgetMonthlyCents,
          spentCents: agent.spentMonthlyCents,
        });
      }

      // 8. Check vendor credit balance — alert if low
      if (
        updatedVendor &&
        updatedVendor.creditBalanceCents <= vendor.lowBalanceAlertCents
      ) {
        const { enqueueEmailAlert } = await import("./email-alerts.js");
        await enqueueEmailAlert({
          type: "vendor-low-balance",
          vendorId,
          balanceCents: updatedVendor.creditBalanceCents,
          thresholdCents: vendor.lowBalanceAlertCents,
        });
      }
    },
    {
      connection: { url: redisUrl },
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, costEventId: (job?.data as CostProcessingJobData)?.costEventId, err },
      "Cost processing job failed",
    );
  });

  return worker;
}
