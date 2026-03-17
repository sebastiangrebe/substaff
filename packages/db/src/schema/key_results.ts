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
import { objectives } from "./objectives.js";

export const keyResults = pgTable(
  "key_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    objectiveId: uuid("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    targetValue: integer("target_value").notNull(),
    currentValue: integer("current_value").notNull().default(0),
    startingValue: integer("starting_value").notNull().default(0),
    unit: text("unit").notNull().default("count"),
    direction: text("direction").notNull().default("up"),
    visualizationType: text("visualization_type").notNull().default("progress"),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("key_results_company_idx").on(table.companyId),
    objectiveIdx: index("key_results_objective_idx").on(table.objectiveId),
  }),
);
