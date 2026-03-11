import Stripe from "stripe";
import { eq, and, gte, lte, sum } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { vendors, vendorUsage, costEvents, creditTransactions } from "@substaff/db";
import { logger } from "../middleware/logger.js";

let stripe: Stripe | null = null;

export function initStripe(secretKey: string) {
  stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });
}

function getStripe(): Stripe {
  if (!stripe) throw new Error("Stripe not configured");
  return stripe;
}

export function stripeService(db: Db) {
  return {
    async ensureCustomer(vendorId: string) {
      const [vendor] = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId));
      if (!vendor) throw new Error("Vendor not found");

      if (vendor.stripeCustomerId) {
        return vendor.stripeCustomerId;
      }

      const customer = await getStripe().customers.create({
        email: vendor.billingEmail,
        name: vendor.name,
        metadata: { vendorId: vendor.id },
      });

      await db
        .update(vendors)
        .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
        .where(eq(vendors.id, vendorId));

      return customer.id;
    },

    async createSubscription(vendorId: string, priceId: string) {
      const customerId = await this.ensureCustomer(vendorId);

      const subscription = await getStripe().subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        metadata: { vendorId },
      });

      return subscription;
    },

    async createTopUpSession(vendorId: string, amountCents: number) {
      const customerId = await this.ensureCustomer(vendorId);

      const appUrl = process.env.APP_URL ?? process.env.SUBSTAFF_API_URL ?? "http://localhost:3100";

      const session = await getStripe().checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Substaff Credit Top-Up",
                description: `Add $${(amountCents / 100).toFixed(2)} to your credit balance`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: { vendorId, type: "credit_top_up" },
        success_url: `${appUrl}/billing?topup=success`,
        cancel_url: `${appUrl}/billing?topup=cancelled`,
      });

      return { url: session.url, sessionId: session.id };
    },

    async getBalance(vendorId: string) {
      const [vendor] = await db
        .select({
          creditBalanceCents: vendors.creditBalanceCents,
          markupBasisPoints: vendors.markupBasisPoints,
        })
        .from(vendors)
        .where(eq(vendors.id, vendorId));

      if (!vendor) throw new Error("Vendor not found");

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [usage] = await db
        .select({
          totalCostCents: sum(costEvents.costCents),
          totalPlatformCostCents: sum(costEvents.platformCostCents),
          totalTokens: sum(costEvents.inputTokens),
        })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.vendorId, vendorId),
            gte(costEvents.occurredAt, periodStart),
          ),
        );

      const monthlyPlatformCostCents = Number(usage?.totalPlatformCostCents ?? 0);
      return {
        creditBalanceCents: vendor.creditBalanceCents,
        markupBasisPoints: vendor.markupBasisPoints,
        monthlyLlmCostCents: monthlyPlatformCostCents,
        monthlyPlatformCostCents,
        monthlyTokens: Number(usage?.totalTokens ?? 0),
      };
    },

    async getCreditHistory(vendorId: string, limit = 50, offset = 0) {
      const rows = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.vendorId, vendorId))
        .orderBy(creditTransactions.createdAt)
        .limit(limit)
        .offset(offset);

      return rows;
    },

    async syncUsage(vendorId: string) {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const [usage] = await db
        .select({
          totalTokens: sum(costEvents.inputTokens),
          totalCostCents: sum(costEvents.costCents),
        })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.vendorId, vendorId),
            gte(costEvents.occurredAt, periodStart),
            lte(costEvents.occurredAt, periodEnd),
          ),
        );

      const totalTokens = Number(usage?.totalTokens ?? 0);
      const totalCostCents = Number(usage?.totalCostCents ?? 0);

      const [vendor] = await db
        .select({ planTokenLimit: vendors.planTokenLimit })
        .from(vendors)
        .where(eq(vendors.id, vendorId));

      await db
        .insert(vendorUsage)
        .values({
          vendorId,
          periodStart,
          periodEnd,
          totalTokensUsed: totalTokens,
          totalCostCents,
          planLimit: vendor?.planTokenLimit ?? 100_000,
          hardCapReached: totalTokens >= (vendor?.planTokenLimit ?? 100_000),
        })
        .onConflictDoUpdate({
          target: [vendorUsage.vendorId, vendorUsage.periodStart],
          set: {
            totalTokensUsed: totalTokens,
            totalCostCents,
            hardCapReached: totalTokens >= (vendor?.planTokenLimit ?? 100_000),
            updatedAt: new Date(),
          },
        });

      return { totalTokens, totalCostCents, periodStart, periodEnd };
    },

    async handleWebhookEvent(event: Stripe.Event) {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const vendorId = session.metadata?.vendorId;
          const type = session.metadata?.type;

          if (!vendorId || type !== "credit_top_up") break;

          const amountCents = session.amount_total ?? 0;
          if (amountCents <= 0) break;

          // Idempotency: check if we already processed this session
          const existing = await db
            .select({ id: creditTransactions.id })
            .from(creditTransactions)
            .where(eq(creditTransactions.stripeSessionId, session.id))
            .limit(1);

          if (existing.length > 0) {
            logger.info({ sessionId: session.id }, "Top-up already processed (idempotent skip)");
            break;
          }

          // Atomically increment vendor credit balance
          const { sql: sqlFn } = await import("drizzle-orm");
          const [vendorAfter] = await db
            .update(vendors)
            .set({
              creditBalanceCents: sqlFn`${vendors.creditBalanceCents} + ${amountCents}`,
              updatedAt: new Date(),
            })
            .where(eq(vendors.id, vendorId))
            .returning({ creditBalanceCents: vendors.creditBalanceCents });

          await db.insert(creditTransactions).values({
            vendorId,
            type: "top_up",
            amountCents,
            balanceAfterCents: vendorAfter?.creditBalanceCents ?? amountCents,
            stripeSessionId: session.id,
            description: `Credit top-up via Stripe ($${(amountCents / 100).toFixed(2)})`,
          });

          logger.info(
            { vendorId, amountCents, sessionId: session.id },
            "Vendor credit top-up processed",
          );
          break;
        }

        case "customer.subscription.updated":
        case "customer.subscription.created": {
          const subscription = event.data.object as Stripe.Subscription;
          const vendorId = subscription.metadata?.vendorId;
          if (!vendorId) break;

          const planMap: Record<string, { plan: string; limit: number }> = {
            active: { plan: "pro", limit: 1_000_000 },
            trialing: { plan: "pro", limit: 1_000_000 },
          };
          const mapped = planMap[subscription.status] ?? { plan: "free", limit: 100_000 };

          await db
            .update(vendors)
            .set({
              plan: mapped.plan,
              planTokenLimit: mapped.limit,
              updatedAt: new Date(),
            })
            .where(eq(vendors.id, vendorId));

          logger.info({ vendorId, plan: mapped.plan }, "Vendor plan updated via Stripe webhook");
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const vendorId = subscription.metadata?.vendorId;
          if (!vendorId) break;

          await db
            .update(vendors)
            .set({ plan: "free", planTokenLimit: 100_000, updatedAt: new Date() })
            .where(eq(vendors.id, vendorId));

          logger.info({ vendorId }, "Vendor downgraded to free via subscription cancellation");
          break;
        }
      }
    },

    async checkBudget(vendorId: string): Promise<{ allowed: boolean; usedTokens: number; limit: number }> {
      const [vendor] = await db
        .select({
          planTokenLimit: vendors.planTokenLimit,
          creditBalanceCents: vendors.creditBalanceCents,
        })
        .from(vendors)
        .where(eq(vendors.id, vendorId));

      if (!vendor) return { allowed: false, usedTokens: 0, limit: 0 };

      // Pre-pay model: check credit balance
      if (vendor.creditBalanceCents <= 0) {
        return { allowed: false, usedTokens: 0, limit: vendor.planTokenLimit };
      }

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [usage] = await db
        .select({ totalTokens: sum(costEvents.inputTokens) })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.vendorId, vendorId),
            gte(costEvents.occurredAt, periodStart),
          ),
        );

      const usedTokens = Number(usage?.totalTokens ?? 0);
      return {
        allowed: usedTokens < vendor.planTokenLimit,
        usedTokens,
        limit: vendor.planTokenLimit,
      };
    },
  };
}
