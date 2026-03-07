import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { agents } from "./agents.js";

export const projectState = pgTable(
  "project_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    stateJson: jsonb("state_json"),
    stateMarkdown: text("state_markdown"),
    version: integer("version").notNull().default(1),
    updatedByAgentId: uuid("updated_by_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectVersionIdx: index("project_state_project_version_idx").on(
      table.projectId,
      table.version,
    ),
    companyIdx: index("project_state_company_idx").on(table.companyId),
  }),
);
