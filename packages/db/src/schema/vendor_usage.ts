import { pgTable, uuid, text, integer, bigint, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { vendors } from "./vendors.js";

export const vendorUsage = pgTable(
  "vendor_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    totalTokensUsed: bigint("total_tokens_used", { mode: "number" }).notNull().default(0),
    totalCostCents: integer("total_cost_cents").notNull().default(0),
    planLimit: integer("plan_limit").notNull(),
    hardCapReached: boolean("hard_cap_reached").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vendorPeriodUniqueIdx: uniqueIndex("vendor_usage_vendor_period_unique_idx").on(
      table.vendorId,
      table.periodStart,
    ),
    vendorPeriodIdx: index("vendor_usage_vendor_period_idx").on(
      table.vendorId,
      table.periodEnd,
    ),
  }),
);
