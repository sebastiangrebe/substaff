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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: index("vendors_slug_idx").on(table.slug),
    stripeCustomerIdx: index("vendors_stripe_customer_idx").on(table.stripeCustomerId),
  }),
);
