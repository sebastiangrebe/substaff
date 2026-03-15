import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { assets } from "./assets.js";

export const assetLinks = pgTable(
  "asset_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull(), // "issue" | "project" | "goal" | "issue_comment"
    linkId: uuid("link_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyLinkIdx: index("asset_links_company_link_idx").on(table.companyId, table.linkType, table.linkId),
    assetLinkUq: uniqueIndex("asset_links_asset_link_uq").on(table.assetId, table.linkType, table.linkId),
  }),
);
