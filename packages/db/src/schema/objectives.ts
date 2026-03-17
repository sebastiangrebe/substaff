import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { goals } from "./goals.js";
import { approvals } from "./approvals.js";

export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    description: text("description"),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id),
    timePeriod: text("time_period").notNull().default("quarterly"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    status: text("status").notNull().default("draft"),
    parentId: uuid("parent_id").references((): AnyPgColumn => objectives.id),
    goalId: uuid("goal_id").references(() => goals.id),
    approvalId: uuid("approval_id").references(() => approvals.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("objectives_company_idx").on(table.companyId),
    companyStatusIdx: index("objectives_company_status_idx").on(table.companyId, table.status),
  }),
);
