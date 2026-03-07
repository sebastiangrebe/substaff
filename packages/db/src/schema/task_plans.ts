import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";

export const taskPlans = pgTable(
  "task_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    planMarkdown: text("plan_markdown").notNull(),
    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    reviewerComments: jsonb("reviewer_comments"),
    approvedByUserId: text("approved_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIssueIdx: index("task_plans_company_issue_idx").on(table.companyId, table.issueId),
    issueStatusIdx: index("task_plans_issue_status_idx").on(table.issueId, table.status),
  }),
);
