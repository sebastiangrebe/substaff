import Stripe from "stripe";
import { eq, and, gte, lte, sum } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { vendors, vendorUsage, costEvents } from "@substaff/db";
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
        .select({ planTokenLimit: vendors.planTokenLimit })
        .from(vendors)
        .where(eq(vendors.id, vendorId));

      if (!vendor) return { allowed: false, usedTokens: 0, limit: 0 };

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
