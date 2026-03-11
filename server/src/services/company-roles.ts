import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { agents, companyRoles } from "@substaff/db";
import {
  AGENT_ROLES,
  BUILTIN_ROLE_LABELS,
  BUILTIN_ROLE_DESCRIPTIONS,
  classifyBuiltinRole,
  type RoleClassification,
  type RoleListItem,
} from "@substaff/shared";
import { conflict, notFound, unprocessable } from "../errors.js";

export function companyRoleService(db: Db) {
  async function agentCountsByRole(companyId: string): Promise<Map<string, number>> {
    const rows = await db
      .select({
        role: agents.role,
        count: sql<number>`count(*)`,
      })
      .from(agents)
      .where(eq(agents.companyId, companyId))
      .groupBy(agents.role);

    return new Map(rows.map((r) => [r.role, Number(r.count)]));
  }

  return {
    /** List all roles: built-in system roles + custom company roles, with agent counts. */
    list: async (companyId: string): Promise<RoleListItem[]> => {
      const [customRoles, counts] = await Promise.all([
        db
          .select()
          .from(companyRoles)
          .where(eq(companyRoles.companyId, companyId)),
        agentCountsByRole(companyId),
      ]);

      const builtinItems: RoleListItem[] = AGENT_ROLES.map((slug) => ({
        slug,
        displayLabel: BUILTIN_ROLE_LABELS[slug] ?? slug,
        description: BUILTIN_ROLE_DESCRIPTIONS[slug] ?? null,
        classification: classifyBuiltinRole(slug),
        source: "system" as const,
        agentCount: counts.get(slug) ?? 0,
      }));

      const customItems: RoleListItem[] = customRoles.map((r) => ({
        slug: r.slug,
        displayLabel: r.displayLabel,
        description: r.description,
        classification: r.classification as RoleClassification,
        source: "custom" as const,
        id: r.id,
        agentCount: counts.get(r.slug) ?? 0,
      }));

      return [...builtinItems, ...customItems];
    },

    getById: async (id: string) => {
      const row = await db
        .select()
        .from(companyRoles)
        .where(eq(companyRoles.id, id))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    getBySlug: async (companyId: string, slug: string) => {
      const row = await db
        .select()
        .from(companyRoles)
        .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.slug, slug)))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    create: async (
      companyId: string,
      data: { slug: string; displayLabel: string; description?: string | null; classification?: string },
    ) => {
      // Reject if slug collides with a built-in role
      if ((AGENT_ROLES as readonly string[]).includes(data.slug)) {
        throw conflict(`Role slug "${data.slug}" is a built-in system role and cannot be used`);
      }

      const row = await db
        .insert(companyRoles)
        .values({
          companyId,
          slug: data.slug,
          displayLabel: data.displayLabel,
          description: data.description ?? null,
          classification: data.classification ?? "ic",
        })
        .returning()
        .then((rows) => rows[0]);

      return row;
    },

    update: async (id: string, data: { displayLabel?: string; description?: string | null; classification?: string }) => {
      const existing = await db
        .select()
        .from(companyRoles)
        .where(eq(companyRoles.id, id))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("Role not found");

      const updated = await db
        .update(companyRoles)
        .set({
          ...(data.displayLabel !== undefined ? { displayLabel: data.displayLabel } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.classification !== undefined ? { classification: data.classification } : {}),
          updatedAt: new Date(),
        })
        .where(eq(companyRoles.id, id))
        .returning()
        .then((rows) => rows[0]);

      return updated;
    },

    remove: async (id: string) => {
      const existing = await db
        .select()
        .from(companyRoles)
        .where(eq(companyRoles.id, id))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("Role not found");

      await db.delete(companyRoles).where(eq(companyRoles.id, id));
      return existing;
    },

    /** Check if a role slug is valid for a company (built-in or custom). */
    isValidRole: async (companyId: string, slug: string): Promise<boolean> => {
      if ((AGENT_ROLES as readonly string[]).includes(slug)) return true;
      const custom = await db
        .select({ id: companyRoles.id })
        .from(companyRoles)
        .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.slug, slug)))
        .then((rows) => rows[0] ?? null);
      return custom !== null;
    },

    /** Get the classification of a role (built-in or custom). Defaults to "ic". */
    classifyRole: async (companyId: string, slug: string): Promise<RoleClassification> => {
      if ((AGENT_ROLES as readonly string[]).includes(slug)) {
        return classifyBuiltinRole(slug);
      }
      const custom = await db
        .select({ classification: companyRoles.classification })
        .from(companyRoles)
        .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.slug, slug)))
        .then((rows) => rows[0] ?? null);
      return (custom?.classification as RoleClassification) ?? "ic";
    },
  };
}
