import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { vendors, agents } from "@substaff/db";
import { logger } from "../middleware/logger.js";

export const EMAIL_ALERTS_QUEUE = "email-alerts";

export type EmailAlertJobData =
  | {
      type: "agent-budget-reached";
      vendorId: string;
      companyId: string;
      agentId: string;
      budgetCents: number;
      spentCents: number;
    }
  | {
      type: "company-budget-approaching";
      vendorId: string;
      companyId: string;
      budgetCents: number;
      spentCents: number;
      percent: number;
    }
  | {
      type: "vendor-low-balance";
      vendorId: string;
      balanceCents: number;
      thresholdCents: number;
    };

let queue: Queue | null = null;

export function initEmailAlertsQueue(redisUrl: string) {
  queue = new Queue(EMAIL_ALERTS_QUEUE, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });
  return queue;
}

export function enqueueEmailAlert(data: EmailAlertJobData) {
  if (!queue) {
    logger.warn({ type: data.type }, "Email alerts queue not initialized — skipping alert");
    return null;
  }
  return queue.add(`alert:${data.type}`, data);
}

export function createEmailAlertsWorker(redisUrl: string, db: Db) {
  const worker = new Worker(
    EMAIL_ALERTS_QUEUE,
    async (job) => {
      const { sendEmail, isEmailConfigured } = await import("../services/email.js");
      if (!isEmailConfigured()) {
        logger.debug({ type: (job.data as EmailAlertJobData).type }, "Email not configured — skipping alert");
        return;
      }

      const data = job.data as EmailAlertJobData;

      // Look up vendor for recipient email
      const [vendor] = await db
        .select({ billingEmail: vendors.billingEmail, name: vendors.name })
        .from(vendors)
        .where(eq(vendors.id, data.vendorId));

      if (!vendor) {
        logger.warn({ vendorId: data.vendorId }, "Vendor not found for email alert");
        return;
      }

      const to = vendor.billingEmail;

      switch (data.type) {
        case "agent-budget-reached": {
          const [agent] = await db
            .select({ name: agents.name })
            .from(agents)
            .where(eq(agents.id, data.agentId));

          const agentName = agent?.name ?? data.agentId;
          const spent = (data.spentCents / 100).toFixed(2);
          const budget = (data.budgetCents / 100).toFixed(2);

          await sendEmail(to, `Agent "${agentName}" paused — budget exceeded`, [
            `<h2>Agent Budget Exceeded</h2>`,
            `<p>Agent <strong>${agentName}</strong> has been automatically paused.</p>`,
            `<p>Monthly spend: <strong>$${spent}</strong> / $${budget} budget</p>`,
            `<p>Increase the agent's budget or manually resume it to continue.</p>`,
          ].join("\n"));
          break;
        }

        case "company-budget-approaching": {
          const spent = (data.spentCents / 100).toFixed(2);
          const budget = (data.budgetCents / 100).toFixed(2);

          await sendEmail(to, `Company budget at ${data.percent}%`, [
            `<h2>Company Budget Alert</h2>`,
            `<p>Your company has used <strong>${data.percent}%</strong> of its monthly budget.</p>`,
            `<p>Spend: <strong>$${spent}</strong> / $${budget}</p>`,
          ].join("\n"));
          break;
        }

        case "vendor-low-balance": {
          // Debounce: don't send more than once per hour
          const [v] = await db
            .select({ lastLowBalanceAlertAt: vendors.lastLowBalanceAlertAt })
            .from(vendors)
            .where(eq(vendors.id, data.vendorId));

          if (
            v?.lastLowBalanceAlertAt &&
            Date.now() - v.lastLowBalanceAlertAt.getTime() < 60 * 60 * 1000
          ) {
            logger.debug({ vendorId: data.vendorId }, "Low balance alert debounced");
            return;
          }

          const balance = (data.balanceCents / 100).toFixed(2);
          const isNegative = data.balanceCents <= 0;

          await sendEmail(
            to,
            isNegative ? "Credit balance depleted — agents will be paused" : "Low credit balance warning",
            [
              `<h2>${isNegative ? "Credits Depleted" : "Low Credit Balance"}</h2>`,
              `<p>Your current credit balance is <strong>$${balance}</strong>.</p>`,
              isNegative
                ? `<p>Agent runs will be blocked until you top up your credits.</p>`
                : `<p>Top up your credits to avoid interruptions to your agents.</p>`,
            ].join("\n"),
          );

          await db
            .update(vendors)
            .set({ lastLowBalanceAlertAt: new Date() })
            .where(eq(vendors.id, data.vendorId));
          break;
        }
      }

      logger.info({ type: data.type, to }, "Email alert sent");
    },
    {
      connection: { url: redisUrl },
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, type: (job?.data as EmailAlertJobData)?.type, err }, "Email alert job failed");
  });

  return worker;
}
