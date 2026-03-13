import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { vendors, agents, companies, approvals } from "@substaff/db";
import { logger } from "../middleware/logger.js";

export const EMAIL_ALERTS_QUEUE = "email-alerts";

export type EmailAlertJobData =
  // ── Existing budget alerts ──
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
    }
  // ── Tier 1: Approval notifications ──
  | {
      type: "approval-requested";
      vendorId: string;
      companyId: string;
      approvalId: string;
      approvalType: string;
      requestedByAgentId: string | null;
      requestedByUserId: string | null;
    }
  | {
      type: "approval-decided";
      vendorId: string;
      companyId: string;
      approvalId: string;
      approvalType: string;
      decision: "approved" | "rejected";
      decisionNote: string | null;
      decidedByUserId: string | null;
    }
  | {
      type: "approval-revision-requested";
      vendorId: string;
      companyId: string;
      approvalId: string;
      approvalType: string;
      decisionNote: string | null;
      decidedByUserId: string | null;
    }
  // ── Tier 1: Agent lifecycle ──
  | {
      type: "agent-terminated";
      vendorId: string;
      companyId: string;
      agentId: string;
      agentName: string;
    }
  | {
      type: "agent-error";
      vendorId: string;
      companyId: string;
      agentId: string;
      errorMessage: string;
      errorCode: string | null;
      runId: string;
    }
  // ── Tier 2: Issue lifecycle ──
  | {
      type: "issue-completed";
      vendorId: string;
      companyId: string;
      issueId: string;
      issueTitle: string;
      issueIdentifier: string | null;
    }
  | {
      type: "issue-blocked";
      vendorId: string;
      companyId: string;
      issueId: string;
      issueTitle: string;
      issueIdentifier: string | null;
    }
  // ── Tier 2: Subscription changes ──
  | {
      type: "subscription-changed";
      vendorId: string;
      change: "upgraded" | "downgraded" | "cancelled";
      plan: string;
    }
  // ── Tier 2: Onboarding ──
  | {
      type: "onboarding-complete";
      vendorId: string;
      companyId: string;
      companyName: string;
      agentCount: number;
    }
  // ── Tier 2: Run failures (persistent) ──
  | {
      type: "run-failures-recurring";
      vendorId: string;
      companyId: string;
      agentId: string;
      failureCount: number;
      lastError: string;
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

// ── HTML email helpers ──

function emailWrapper(content: string): string {
  return [
    `<!DOCTYPE html>`,
    `<html><head><meta charset="utf-8"></head>`,
    `<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px;">`,
    content,
    `<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px;">`,
    `<p style="font-size: 12px; color: #888;">Sent by Substaff. You can manage notification preferences in your account settings.</p>`,
    `</body></html>`,
  ].join("\n");
}

function approvalTypeLabel(type: string): string {
  switch (type) {
    case "hire_agent": return "Hire Agent";
    case "approve_ceo_strategy": return "CEO Strategy";
    default: return type;
  }
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
        // ── Existing budget alerts ──

        case "agent-budget-reached": {
          const [agent] = await db
            .select({ name: agents.name })
            .from(agents)
            .where(eq(agents.id, data.agentId));

          const agentName = agent?.name ?? data.agentId;
          const spent = (data.spentCents / 100).toFixed(2);
          const budget = (data.budgetCents / 100).toFixed(2);

          await sendEmail(to, `Agent "${agentName}" paused — budget exceeded`, emailWrapper([
            `<h2>Agent Budget Exceeded</h2>`,
            `<p>Agent <strong>${agentName}</strong> has been automatically paused.</p>`,
            `<p>Monthly spend: <strong>$${spent}</strong> / $${budget} budget</p>`,
            `<p>Increase the agent's budget or manually resume it to continue.</p>`,
          ].join("\n")));
          break;
        }

        case "company-budget-approaching": {
          const spent = (data.spentCents / 100).toFixed(2);
          const budget = (data.budgetCents / 100).toFixed(2);

          await sendEmail(to, `Company budget at ${data.percent}%`, emailWrapper([
            `<h2>Company Budget Alert</h2>`,
            `<p>Your company has used <strong>${data.percent}%</strong> of its monthly budget.</p>`,
            `<p>Spend: <strong>$${spent}</strong> / $${budget}</p>`,
          ].join("\n")));
          break;
        }

        case "vendor-low-balance": {
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
            emailWrapper([
              `<h2>${isNegative ? "Credits Depleted" : "Low Credit Balance"}</h2>`,
              `<p>Your current credit balance is <strong>$${balance}</strong>.</p>`,
              isNegative
                ? `<p>Agent runs will be blocked until you top up your credits.</p>`
                : `<p>Top up your credits to avoid interruptions to your agents.</p>`,
            ].join("\n")),
          );

          await db
            .update(vendors)
            .set({ lastLowBalanceAlertAt: new Date() })
            .where(eq(vendors.id, data.vendorId));
          break;
        }

        // ── Tier 1: Approval notifications ──

        case "approval-requested": {
          let requesterName = "An agent";
          if (data.requestedByAgentId) {
            const [agent] = await db
              .select({ name: agents.name })
              .from(agents)
              .where(eq(agents.id, data.requestedByAgentId));
            requesterName = agent?.name ?? "An agent";
          }

          const [company] = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, data.companyId));

          await sendEmail(
            to,
            `Approval needed: ${approvalTypeLabel(data.approvalType)}`,
            emailWrapper([
              `<h2>New Approval Request</h2>`,
              `<p><strong>${requesterName}</strong> has requested approval for: <strong>${approvalTypeLabel(data.approvalType)}</strong></p>`,
              company ? `<p>Company: <strong>${company.name}</strong></p>` : "",
              `<p>Log in to Substaff to review and approve or reject this request.</p>`,
            ].join("\n")),
          );
          break;
        }

        case "approval-decided": {
          const [approval] = await db
            .select({ requestedByAgentId: approvals.requestedByAgentId, payload: approvals.payload })
            .from(approvals)
            .where(eq(approvals.id, data.approvalId));

          let agentName = "Unknown";
          if (data.approvalType === "hire_agent" && approval?.payload) {
            const payload = approval.payload as Record<string, unknown>;
            agentName = String(payload.name ?? "New Agent");
          }

          const isApproved = data.decision === "approved";
          const emoji = isApproved ? "✅" : "❌";

          await sendEmail(
            to,
            `${emoji} ${approvalTypeLabel(data.approvalType)} ${data.decision}`,
            emailWrapper([
              `<h2>${approvalTypeLabel(data.approvalType)} ${isApproved ? "Approved" : "Rejected"}</h2>`,
              data.approvalType === "hire_agent"
                ? `<p>The request to hire <strong>${agentName}</strong> has been <strong>${data.decision}</strong>.</p>`
                : `<p>The ${approvalTypeLabel(data.approvalType)} request has been <strong>${data.decision}</strong>.</p>`,
              data.decisionNote ? `<p>Note: <em>${data.decisionNote}</em></p>` : "",
              isApproved && data.approvalType === "hire_agent"
                ? `<p>The agent has been activated and will begin working on the next heartbeat cycle.</p>`
                : "",
              !isApproved && data.approvalType === "hire_agent"
                ? `<p>The agent has been terminated.</p>`
                : "",
            ].join("\n")),
          );
          break;
        }

        case "approval-revision-requested": {
          await sendEmail(
            to,
            `Revision requested: ${approvalTypeLabel(data.approvalType)}`,
            emailWrapper([
              `<h2>Approval Revision Requested</h2>`,
              `<p>A revision has been requested for the <strong>${approvalTypeLabel(data.approvalType)}</strong> approval.</p>`,
              data.decisionNote ? `<p>Feedback: <em>${data.decisionNote}</em></p>` : "",
              `<p>The requesting agent will need to resubmit the approval with changes.</p>`,
            ].join("\n")),
          );
          break;
        }

        // ── Tier 1: Agent lifecycle ──

        case "agent-terminated": {
          await sendEmail(
            to,
            `Agent "${data.agentName}" terminated`,
            emailWrapper([
              `<h2>Agent Terminated</h2>`,
              `<p>Agent <strong>${data.agentName}</strong> has been terminated.</p>`,
              `<p>This action is irreversible. All active runs have been cancelled and API keys revoked.</p>`,
            ].join("\n")),
          );
          break;
        }

        case "agent-error": {
          const [agent] = await db
            .select({ name: agents.name })
            .from(agents)
            .where(eq(agents.id, data.agentId));

          const agentName = agent?.name ?? data.agentId;

          await sendEmail(
            to,
            `Agent "${agentName}" entered error state`,
            emailWrapper([
              `<h2>Agent Error</h2>`,
              `<p>Agent <strong>${agentName}</strong> has entered an error state after a failed run.</p>`,
              `<p>Error: <code>${data.errorMessage}</code></p>`,
              data.errorCode ? `<p>Error code: <code>${data.errorCode}</code></p>` : "",
              `<p>The agent will not process new tasks until the issue is resolved. Check the run logs for details.</p>`,
            ].join("\n")),
          );
          break;
        }

        // ── Tier 2: Issue lifecycle ──

        case "issue-completed": {
          const label = data.issueIdentifier ?? data.issueId.slice(0, 8);

          await sendEmail(
            to,
            `Issue completed: ${label} — ${data.issueTitle}`,
            emailWrapper([
              `<h2>Issue Completed</h2>`,
              `<p>Issue <strong>${label}</strong> has been marked as done.</p>`,
              `<p>Title: <strong>${data.issueTitle}</strong></p>`,
            ].join("\n")),
          );
          break;
        }

        case "issue-blocked": {
          const label = data.issueIdentifier ?? data.issueId.slice(0, 8);

          await sendEmail(
            to,
            `Issue blocked: ${label} — ${data.issueTitle}`,
            emailWrapper([
              `<h2>Issue Blocked</h2>`,
              `<p>Issue <strong>${label}</strong> has been marked as blocked and may need your attention.</p>`,
              `<p>Title: <strong>${data.issueTitle}</strong></p>`,
              `<p>Check the issue details for blocking reasons or unresolved dependencies.</p>`,
            ].join("\n")),
          );
          break;
        }

        // ── Tier 2: Subscription changes ──

        case "subscription-changed": {
          const subjects: Record<string, string> = {
            upgraded: "Plan upgraded to Pro",
            downgraded: "Plan downgraded to Free",
            cancelled: "Subscription cancelled",
          };

          await sendEmail(
            to,
            subjects[data.change] ?? `Subscription ${data.change}`,
            emailWrapper([
              `<h2>Subscription ${data.change.charAt(0).toUpperCase() + data.change.slice(1)}</h2>`,
              data.change === "upgraded"
                ? `<p>Your plan has been upgraded to <strong>Pro</strong>. You now have access to 1,000,000 tokens/month.</p>`
                : data.change === "downgraded"
                  ? `<p>Your plan has been downgraded to <strong>Free</strong>. Your token limit is now 100,000/month.</p>`
                  : `<p>Your subscription has been cancelled. Your account has been downgraded to the Free plan with 100,000 tokens/month.</p>`,
            ].join("\n")),
          );
          break;
        }

        // ── Tier 2: Onboarding ──

        case "onboarding-complete": {
          await sendEmail(
            to,
            `Your team "${data.companyName}" is live!`,
            emailWrapper([
              `<h2>Welcome to Substaff! 🚀</h2>`,
              `<p>Your company <strong>${data.companyName}</strong> has been set up with <strong>${data.agentCount}</strong> agent${data.agentCount !== 1 ? "s" : ""}.</p>`,
              `<p>Your agents will begin working on their first heartbeat cycle. Check the dashboard to see them in action.</p>`,
            ].join("\n")),
          );
          break;
        }

        // ── Tier 2: Recurring failures ──

        case "run-failures-recurring": {
          const [agent] = await db
            .select({ name: agents.name })
            .from(agents)
            .where(eq(agents.id, data.agentId));

          const agentName = agent?.name ?? data.agentId;

          await sendEmail(
            to,
            `Agent "${agentName}" has ${data.failureCount} consecutive failures`,
            emailWrapper([
              `<h2>Recurring Agent Failures</h2>`,
              `<p>Agent <strong>${agentName}</strong> has failed <strong>${data.failureCount}</strong> consecutive runs.</p>`,
              `<p>Last error: <code>${data.lastError}</code></p>`,
              `<p>Consider pausing the agent and reviewing its configuration or run logs.</p>`,
            ].join("\n")),
          );
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
