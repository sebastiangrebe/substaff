import { Queue, Worker } from "bullmq";
import { and, count, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import {
  agents,
  companies,
  costEvents,
  heartbeatRuns,
  issues,
  vendors,
} from "@substaff/db";
import { logger } from "../middleware/logger.js";

export const DAILY_DIGEST_QUEUE = "daily-digest";

export function initDailyDigestQueue(redisUrl: string) {
  const queue = new Queue(DAILY_DIGEST_QUEUE, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 200 },
    },
  });

  // Schedule daily at 8:00 AM UTC
  void queue.upsertJobScheduler(
    "daily-digest",
    { pattern: "0 8 * * *" },
    { name: "daily-digest", data: { type: "send-digests" } },
  );

  return queue;
}

export function createDailyDigestWorker(redisUrl: string, db: Db) {
  const worker = new Worker(
    DAILY_DIGEST_QUEUE,
    async () => {
      const { sendEmail, isEmailConfigured } = await import("../services/email.js");
      if (!isEmailConfigured()) {
        logger.debug("Email not configured — skipping daily digest");
        return;
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Get all active vendors
      const allVendors = await db
        .select({ id: vendors.id, billingEmail: vendors.billingEmail, name: vendors.name })
        .from(vendors);

      for (const vendor of allVendors) {
        try {
          await sendVendorDigest(db, vendor, since, sendEmail);
        } catch (err) {
          logger.error({ err, vendorId: vendor.id }, "Failed to send daily digest for vendor");
        }
      }
    },
    {
      connection: { url: redisUrl },
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Daily digest job failed");
  });

  return worker;
}

async function sendVendorDigest(
  db: Db,
  vendor: { id: string; billingEmail: string; name: string },
  since: Date,
  sendEmail: (to: string, subject: string, html: string) => Promise<void>,
) {
  // Get all companies for this vendor
  const vendorCompanies = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.vendorId, vendor.id), eq(companies.status, "active")));

  if (vendorCompanies.length === 0) return;

  const companyIds = vendorCompanies.map((c) => c.id);

  // Aggregate stats across all companies
  const [runsCompleted] = await db
    .select({ count: count() })
    .from(heartbeatRuns)
    .where(
      and(
        sql`${heartbeatRuns.companyId} = ANY(${companyIds})`,
        eq(heartbeatRuns.status, "succeeded"),
        gte(heartbeatRuns.finishedAt, since),
      ),
    );

  const [runsFailed] = await db
    .select({ count: count() })
    .from(heartbeatRuns)
    .where(
      and(
        sql`${heartbeatRuns.companyId} = ANY(${companyIds})`,
        eq(heartbeatRuns.status, "failed"),
        gte(heartbeatRuns.finishedAt, since),
      ),
    );

  const [issuesDone] = await db
    .select({ count: count() })
    .from(issues)
    .where(
      and(
        sql`${issues.companyId} = ANY(${companyIds})`,
        eq(issues.status, "done"),
        gte(issues.completedAt, since),
      ),
    );

  const [issuesCreated] = await db
    .select({ count: count() })
    .from(issues)
    .where(
      and(
        sql`${issues.companyId} = ANY(${companyIds})`,
        gte(issues.createdAt, since),
      ),
    );

  const [costResult] = await db
    .select({ total: sql<number>`coalesce(sum(${costEvents.platformCostCents}), 0)` })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.vendorId, vendor.id),
        gte(costEvents.occurredAt, since),
      ),
    );

  const [agentsPaused] = await db
    .select({ count: count() })
    .from(agents)
    .where(
      and(
        sql`${agents.companyId} = ANY(${companyIds})`,
        eq(agents.status, "paused"),
      ),
    );

  const [agentsErrored] = await db
    .select({ count: count() })
    .from(agents)
    .where(
      and(
        sql`${agents.companyId} = ANY(${companyIds})`,
        eq(agents.status, "error"),
      ),
    );

  const runsCompletedCount = runsCompleted?.count ?? 0;
  const runsFailedCount = runsFailed?.count ?? 0;
  const issuesDoneCount = issuesDone?.count ?? 0;
  const issuesCreatedCount = issuesCreated?.count ?? 0;
  const totalCostCents = Number(costResult?.total ?? 0);
  const pausedCount = agentsPaused?.count ?? 0;
  const erroredCount = agentsErrored?.count ?? 0;

  // Skip if no activity
  if (runsCompletedCount === 0 && runsFailedCount === 0 && issuesDoneCount === 0 && issuesCreatedCount === 0) {
    return;
  }

  const costFormatted = (totalCostCents / 100).toFixed(2);

  // Build attention items
  const attentionItems: string[] = [];
  if (pausedCount > 0) {
    attentionItems.push(`<li><strong>${pausedCount}</strong> agent${pausedCount !== 1 ? "s" : ""} paused (budget or manual)</li>`);
  }
  if (erroredCount > 0) {
    attentionItems.push(`<li><strong>${erroredCount}</strong> agent${erroredCount !== 1 ? "s" : ""} in error state</li>`);
  }
  if (runsFailedCount > 0) {
    attentionItems.push(`<li><strong>${runsFailedCount}</strong> run${runsFailedCount !== 1 ? "s" : ""} failed in the last 24h</li>`);
  }

  const html = [
    `<!DOCTYPE html>`,
    `<html><head><meta charset="utf-8"></head>`,
    `<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px;">`,
    `<h2>Daily Digest — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h2>`,
    `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">`,
    `<tr><td style="padding: 8px 16px; border-bottom: 1px solid #eee;">Runs completed</td><td style="padding: 8px 16px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${runsCompletedCount}</td></tr>`,
    `<tr><td style="padding: 8px 16px; border-bottom: 1px solid #eee;">Runs failed</td><td style="padding: 8px 16px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600; ${runsFailedCount > 0 ? "color: #dc2626;" : ""}">${runsFailedCount}</td></tr>`,
    `<tr><td style="padding: 8px 16px; border-bottom: 1px solid #eee;">Issues completed</td><td style="padding: 8px 16px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${issuesDoneCount}</td></tr>`,
    `<tr><td style="padding: 8px 16px; border-bottom: 1px solid #eee;">Issues created</td><td style="padding: 8px 16px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${issuesCreatedCount}</td></tr>`,
    `<tr><td style="padding: 8px 16px; border-bottom: 1px solid #eee;">Cost (24h)</td><td style="padding: 8px 16px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">$${costFormatted}</td></tr>`,
    `</table>`,
    attentionItems.length > 0
      ? `<div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px 16px; margin: 16px 0;"><strong>Needs attention:</strong><ul style="margin: 8px 0 0; padding-left: 20px;">${attentionItems.join("")}</ul></div>`
      : "",
    `<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px;">`,
    `<p style="font-size: 12px; color: #888;">Sent by Substaff. You can manage notification preferences in your account settings.</p>`,
    `</body></html>`,
  ].join("\n");

  await sendEmail(
    vendor.billingEmail,
    `Substaff Daily Digest — ${issuesDoneCount} issues done, ${runsCompletedCount} runs`,
    html,
  );

  logger.info({ vendorId: vendor.id, runsCompletedCount, issuesDoneCount }, "Daily digest sent");
}
