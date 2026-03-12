import { pgTable, uuid, text, timestamp, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { vendors } from "./vendors.js";
import { companies } from "./companies.js";

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    composioConnectedAccountId: text("composio_connected_account_id"),
    config: jsonb("config").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProviderUniqueIdx: uniqueIndex("integration_connections_company_provider_unique_idx").on(
      table.companyId,
      table.provider,
    ),
    vendorIdx: index("integration_connections_vendor_idx").on(table.vendorId),
  }),
);
