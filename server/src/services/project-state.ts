import { eq, and, desc } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { projectState } from "@substaff/db";

export function projectStateService(db: Db) {
  return {
    async get(projectId: string, companyId: string) {
      const rows = await db
        .select()
        .from(projectState)
        .where(
          and(
            eq(projectState.projectId, projectId),
            eq(projectState.companyId, companyId),
          ),
        )
        .orderBy(desc(projectState.version))
        .limit(1);
      return rows[0] ?? null;
    },

    async upsert(input: {
      projectId: string;
      companyId: string;
      stateJson?: Record<string, unknown> | null;
      stateMarkdown?: string | null;
      updatedByAgentId?: string | null;
    }) {
      const existing = await this.get(input.projectId, input.companyId);
      const nextVersion = existing ? existing.version + 1 : 1;

      const [row] = await db
        .insert(projectState)
        .values({
          projectId: input.projectId,
          companyId: input.companyId,
          stateJson: input.stateJson ?? null,
          stateMarkdown: input.stateMarkdown ?? null,
          version: nextVersion,
          updatedByAgentId: input.updatedByAgentId ?? null,
        })
        .returning();

      return row!;
    },

    async listVersions(projectId: string, companyId: string) {
      return db
        .select()
        .from(projectState)
        .where(
          and(
            eq(projectState.projectId, projectId),
            eq(projectState.companyId, companyId),
          ),
        )
        .orderBy(desc(projectState.version));
    },
  };
}
