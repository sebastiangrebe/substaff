import { Queue, Worker } from "bullmq";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { agents, companies, costEvents, vendors, creditTransactions } from "@substaff/db";
import { logger } from "../middleware/logger.js";

export const COST_PROCESSING_QUEUE = "cost-processing";

export interface CostProcessingJobData {
  costEventId: string;
  vendorId: string;
  companyId: string;
  agentId: string;
  rawCostCents: number;
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
      const { costEventId, vendorId, companyId, agentId, rawCostCents } =
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

      // 6. Increment agent and company monthly spend (raw for internal budget, platform for user-facing)
      await db
        .update(agents)
        .set({
          spentMonthlyCents: sql`${agents.spentMonthlyCents} + ${rawCostCents}`,
          platformSpentMonthlyCents: sql`${agents.platformSpentMonthlyCents} + ${platformCostCents}`,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agentId));

      await db
        .update(companies)
        .set({
          spentMonthlyCents: sql`${companies.spentMonthlyCents} + ${rawCostCents}`,
          platformSpentMonthlyCents: sql`${companies.platformSpentMonthlyCents} + ${platformCostCents}`,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));

      // 7. Check agent budget — pause if exceeded
      const [agent] = await db
        .select({
          budgetMonthlyCents: agents.budgetMonthlyCents,
          spentMonthlyCents: agents.spentMonthlyCents,
          status: agents.status,
        })
        .from(agents)
        .where(eq(agents.id, agentId));

      if (
        agent &&
        agent.budgetMonthlyCents > 0 &&
        agent.spentMonthlyCents >= agent.budgetMonthlyCents &&
        agent.status !== "paused" &&
        agent.status !== "terminated"
      ) {
        await db
          .update(agents)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(agents.id, agentId));

        logger.info(
          { agentId, spent: agent.spentMonthlyCents, budget: agent.budgetMonthlyCents },
          "Agent paused — monthly budget exceeded",
        );

        // Enqueue email alert for agent budget reached
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
