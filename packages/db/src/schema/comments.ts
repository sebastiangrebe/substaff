import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    linkType: text("link_type").notNull().default("issue"),
    linkId: uuid("link_id").notNull(),
    authorAgentId: uuid("author_agent_id").references(() => agents.id),
    authorUserId: text("author_user_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    linkIdx: index("comments_link_idx").on(table.linkType, table.linkId),
    companyIdx: index("comments_company_idx").on(table.companyId),
    linkCreatedIdx: index("comments_link_created_idx").on(table.linkType, table.linkId, table.createdAt),
  }),
);
