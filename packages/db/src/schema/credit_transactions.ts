import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { vendors } from "./vendors.js";
import { costEvents } from "./cost_events.js";

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    /** top_up | usage_deduction | adjustment | refund */
    type: text("type").notNull(),
    /** Positive for credits (top-up, refund), negative for debits (usage_deduction). */
    amountCents: integer("amount_cents").notNull(),
    /** Running balance after this transaction for audit trail. */
    balanceAfterCents: integer("balance_after_cents").notNull(),
    /** Stripe Checkout Session ID for top-up transactions. */
    stripeSessionId: text("stripe_session_id"),
    /** Linked cost event for usage_deduction transactions. */
    costEventId: uuid("cost_event_id").references(() => costEvents.id),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vendorCreatedIdx: index("credit_tx_vendor_created_idx").on(table.vendorId, table.createdAt),
    stripeSessionIdx: index("credit_tx_stripe_session_idx").on(table.stripeSessionId),
  }),
);
