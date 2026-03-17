import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { keyResults } from "./key_results.js";

export const kpiEntries = pgTable(
  "kpi_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    keyResultId: uuid("key_result_id").notNull().references(() => keyResults.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    sourceAgentId: uuid("source_agent_id").references(() => agents.id),
    sourceUserId: text("source_user_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("kpi_entries_company_idx").on(table.companyId),
    keyResultIdx: index("kpi_entries_key_result_idx").on(table.keyResultId),
    recordedAtIdx: index("kpi_entries_recorded_at_idx").on(table.keyResultId, table.recordedAt),
  }),
);
