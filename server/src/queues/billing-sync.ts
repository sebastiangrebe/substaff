import { Queue, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { agents, companies, goals, issues, projects, vendors } from "@substaff/db";
import { stripeService } from "../services/stripe.js";
import { logger } from "../middleware/logger.js";

export const BILLING_SYNC_QUEUE = "billing-sync";

export type BillingSyncJobData =
  | { type: "sync-vendor-usage" }
  | { type: "monthly-spend-reset" };

export function initBillingSyncQueue(redisUrl: string) {
  const queue = new Queue(BILLING_SYNC_QUEUE, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  // Repeatable: sync vendor usage every hour
  void queue.upsertJobScheduler(
    "sync-vendor-usage",
    { every: 60 * 60 * 1000 },
    { name: "sync-vendor-usage", data: { type: "sync-vendor-usage" as const } },
  );

  // Repeatable: monthly spend reset — 1st of each month at 00:00 UTC
  void queue.upsertJobScheduler(
    "monthly-spend-reset",
    { pattern: "0 0 1 * *" },
    { name: "monthly-spend-reset", data: { type: "monthly-spend-reset" as const } },
  );

  return queue;
}

export function createBillingSyncWorker(redisUrl: string, db: Db) {
  const billing = stripeService(db);

  const worker = new Worker(
    BILLING_SYNC_QUEUE,
    async (job) => {
      const data = job.data as BillingSyncJobData;

      switch (data.type) {
        case "sync-vendor-usage": {
          const allVendors = await db
            .select({ id: vendors.id })
            .from(vendors);

          let synced = 0;
          for (const v of allVendors) {
            try {
              await billing.syncUsage(v.id);
              synced++;
            } catch (err) {
              logger.warn({ vendorId: v.id, err }, "Failed to sync usage for vendor");
            }
          }

          logger.info({ vendorCount: allVendors.length, synced }, "Vendor usage sync complete");
          break;
        }

        case "monthly-spend-reset": {
          await db
            .update(agents)
            .set({ spentMonthlyCents: 0, platformSpentMonthlyCents: 0, updatedAt: new Date() })
            .where(sql`${agents.spentMonthlyCents} > 0 OR ${agents.platformSpentMonthlyCents} > 0`);

          await db
            .update(companies)
            .set({ spentMonthlyCents: 0, platformSpentMonthlyCents: 0, updatedAt: new Date() })
            .where(sql`${companies.spentMonthlyCents} > 0 OR ${companies.platformSpentMonthlyCents} > 0`);

          await db
            .update(goals)
            .set({ spentMonthlyCents: 0, platformSpentMonthlyCents: 0, updatedAt: new Date() })
            .where(sql`${goals.spentMonthlyCents} > 0 OR ${goals.platformSpentMonthlyCents} > 0`);

          await db
            .update(projects)
            .set({ spentMonthlyCents: 0, platformSpentMonthlyCents: 0, updatedAt: new Date() })
            .where(sql`${projects.spentMonthlyCents} > 0 OR ${projects.platformSpentMonthlyCents} > 0`);

          await db
            .update(issues)
            .set({ spentMonthlyCents: 0, platformSpentMonthlyCents: 0, updatedAt: new Date() })
            .where(sql`${issues.spentMonthlyCents} > 0 OR ${issues.platformSpentMonthlyCents} > 0`);

          logger.info("Monthly spend reset complete");
          break;
        }
      }
    },
    {
      connection: { url: redisUrl },
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, type: (job?.data as BillingSyncJobData)?.type, err }, "Billing sync job failed");
  });

  return worker;
}
