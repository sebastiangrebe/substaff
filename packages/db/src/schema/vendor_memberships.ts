import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { vendors } from "./vendors.js";
import { authUsers } from "./auth.js";

export const vendorMemberships = pgTable(
  "vendor_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vendorUserUniqueIdx: uniqueIndex("vendor_memberships_vendor_user_unique_idx").on(
      table.vendorId,
      table.userId,
    ),
    vendorRoleIdx: index("vendor_memberships_vendor_role_idx").on(table.vendorId, table.role),
    userIdx: index("vendor_memberships_user_idx").on(table.userId),
  }),
);
