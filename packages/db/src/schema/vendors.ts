import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    billingEmail: text("billing_email").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    plan: text("plan").notNull().default("free"),
    planTokenLimit: integer("plan_token_limit").notNull().default(100000),
    /** Pre-paid credit balance in cents. Topped up via Stripe Checkout, deducted by agent runs. */
    creditBalanceCents: integer("credit_balance_cents").notNull().default(0),
    /** Markup factor in basis points (10000 = 1.0x, 15000 = 1.5x). Applied to raw LLM cost to compute platform price. */
    markupBasisPoints: integer("markup_basis_points").notNull().default(15000),
    /** Credit balance threshold (cents) below which a low-balance email alert is sent. */
    lowBalanceAlertCents: integer("low_balance_alert_cents").notNull().default(500),
    /** Debounce: timestamp of the last low-balance alert sent. */
    lastLowBalanceAlertAt: timestamp("last_low_balance_alert_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: index("vendors_slug_idx").on(table.slug),
    stripeCustomerIdx: index("vendors_stripe_customer_idx").on(table.stripeCustomerId),
  }),
);
