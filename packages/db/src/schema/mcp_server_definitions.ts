import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const mcpServerDefinitions = pgTable("mcp_server_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description").notNull(),
  iconUrl: text("icon_url"),
  mcpPackage: text("mcp_package").notNull(),
  mcpCommand: text("mcp_command").notNull(),
  mcpArgs: text("mcp_args").array().notNull(),
  requiredEnvKeys: text("required_env_keys").array().notNull(),
  optionalEnvKeys: text("optional_env_keys").array().notNull().default([]),
  documentationUrl: text("documentation_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
