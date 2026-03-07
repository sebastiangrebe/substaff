import { pgTable, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

export const issueDependencies = pgTable(
  "issue_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    dependsOnIssueId: uuid("depends_on_issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniquePair: uniqueIndex("issue_dependencies_pair_idx").on(table.issueId, table.dependsOnIssueId),
    issueIdx: index("issue_dependencies_issue_idx").on(table.issueId),
    dependsOnIdx: index("issue_dependencies_depends_on_idx").on(table.dependsOnIssueId),
    companyIdx: index("issue_dependencies_company_idx").on(table.companyId),
  }),
);
