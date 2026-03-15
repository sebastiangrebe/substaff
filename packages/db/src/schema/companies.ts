import { pgTable, uuid, text, integer, timestamp, boolean, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { vendors } from "./vendors.js";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    issuePrefix: text("issue_prefix").notNull().default("SUB"),
    issueCounter: integer("issue_counter").notNull().default(0),
    budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
    spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
    platformSpentMonthlyCents: integer("platform_spent_monthly_cents").notNull().default(0),
    budgetTotalCents: integer("budget_total_cents").notNull().default(0),
    spentTotalCents: integer("spent_total_cents").notNull().default(0),
    platformSpentTotalCents: integer("platform_spent_total_cents").notNull().default(0),
    requirePlanApproval: boolean("require_plan_approval").notNull().default(true),
    requireHireApproval: boolean("require_hire_approval").notNull().default(true),
    orgChartData: jsonb("org_chart_data"),
    brandColor: text("brand_color"),
    workingHours: jsonb("working_hours").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issuePrefixUniqueIdx: uniqueIndex("companies_issue_prefix_idx").on(table.issuePrefix),
    vendorIdx: index("companies_vendor_idx").on(table.vendorId),
    vendorStatusIdx: index("companies_vendor_status_idx").on(table.vendorId, table.status),
  }),
);
