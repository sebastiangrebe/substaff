import { eq, desc, and, gte } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { objectives, keyResults, kpiEntries } from "@substaff/db";
import type { KeyResultWithEntries, ObjectiveWithKeyResults } from "@substaff/shared";

function calcProgress(
  currentValue: number,
  startingValue: number,
  targetValue: number,
  direction: string,
): number {
  const range = targetValue - startingValue;
  if (range === 0) return currentValue === targetValue ? 100 : 0;
  const raw = ((currentValue - startingValue) / range) * 100;
  // For "down" direction, the range is negative so math works naturally
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function strategyService(db: Db) {
  return {
    // ── Objectives ──────────────────────────────────────────────────

    listObjectives: (companyId: string) =>
      db.select().from(objectives).where(eq(objectives.companyId, companyId)),

    getObjectiveById: (id: string) =>
      db
        .select()
        .from(objectives)
        .where(eq(objectives.id, id))
        .then((rows) => rows[0] ?? null),

    createObjective: (companyId: string, data: Omit<typeof objectives.$inferInsert, "companyId">) =>
      db
        .insert(objectives)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    updateObjective: (id: string, data: Partial<typeof objectives.$inferInsert>) =>
      db
        .update(objectives)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(objectives.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    removeObjective: (id: string) =>
      db
        .delete(objectives)
        .where(eq(objectives.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    // ── Key Results ─────────────────────────────────────────────────

    listKeyResults: (objectiveId: string) =>
      db
        .select()
        .from(keyResults)
        .where(eq(keyResults.objectiveId, objectiveId)),

    getKeyResultById: (id: string) =>
      db
        .select()
        .from(keyResults)
        .where(eq(keyResults.id, id))
        .then((rows) => rows[0] ?? null),

    createKeyResult: (companyId: string, data: Omit<typeof keyResults.$inferInsert, "companyId">) =>
      db
        .insert(keyResults)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    updateKeyResult: (id: string, data: Partial<typeof keyResults.$inferInsert>) =>
      db
        .update(keyResults)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(keyResults.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    removeKeyResult: (id: string) =>
      db
        .delete(keyResults)
        .where(eq(keyResults.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    // ── KPI Entries ─────────────────────────────────────────────────

    listKpiEntries: (
      keyResultId: string,
      opts?: { limit?: number; since?: string },
    ) => {
      const conditions = [eq(kpiEntries.keyResultId, keyResultId)];
      if (opts?.since) {
        conditions.push(gte(kpiEntries.recordedAt, new Date(opts.since)));
      }
      return db
        .select()
        .from(kpiEntries)
        .where(and(...conditions))
        .orderBy(desc(kpiEntries.recordedAt))
        .limit(opts?.limit ?? 100);
    },

    createKpiEntry: async (
      companyId: string,
      data: { keyResultId: string; value: number; recordedAt?: string; note?: string | null; sourceAgentId?: string | null; sourceUserId?: string | null },
    ) => {
      const entry = await db
        .insert(kpiEntries)
        .values({
          companyId,
          keyResultId: data.keyResultId,
          value: data.value,
          recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
          note: data.note ?? null,
          sourceAgentId: data.sourceAgentId ?? null,
          sourceUserId: data.sourceUserId ?? null,
        })
        .returning()
        .then((rows) => rows[0]);

      // Update parent key result's currentValue
      await db
        .update(keyResults)
        .set({ currentValue: data.value, updatedAt: new Date() })
        .where(eq(keyResults.id, data.keyResultId));

      return entry;
    },

    // ── Composite reads ─────────────────────────────────────────────

    getObjectiveWithKeyResults: async (id: string): Promise<ObjectiveWithKeyResults | null> => {
      const objective = await db
        .select()
        .from(objectives)
        .where(eq(objectives.id, id))
        .then((rows) => rows[0] ?? null);
      if (!objective) return null;

      const krs = await db
        .select()
        .from(keyResults)
        .where(eq(keyResults.objectiveId, id));

      const krWithEntries: KeyResultWithEntries[] = await Promise.all(
        krs.map(async (kr) => {
          const entries = await db
            .select()
            .from(kpiEntries)
            .where(eq(kpiEntries.keyResultId, kr.id))
            .orderBy(desc(kpiEntries.recordedAt))
            .limit(50);
          const progressPercent = calcProgress(
            kr.currentValue,
            kr.startingValue,
            kr.targetValue,
            kr.direction,
          );
          return { ...kr, entries, progressPercent } as unknown as KeyResultWithEntries;
        }),
      );

      const overallProgressPercent =
        krWithEntries.length > 0
          ? Math.round(
              krWithEntries.reduce((sum, kr) => sum + kr.progressPercent, 0) /
                krWithEntries.length,
            )
          : 0;

      return {
        ...objective,
        keyResults: krWithEntries,
        overallProgressPercent,
      } as unknown as ObjectiveWithKeyResults;
    },

    listObjectivesWithProgress: async (companyId: string) => {
      const objs = await db
        .select()
        .from(objectives)
        .where(eq(objectives.companyId, companyId));

      return Promise.all(
        objs.map(async (obj) => {
          const krs = await db
            .select()
            .from(keyResults)
            .where(eq(keyResults.objectiveId, obj.id));

          const krProgress = krs.map((kr) =>
            calcProgress(kr.currentValue, kr.startingValue, kr.targetValue, kr.direction),
          );
          const overallProgressPercent =
            krProgress.length > 0
              ? Math.round(krProgress.reduce((a, b) => a + b, 0) / krProgress.length)
              : 0;

          return {
            ...obj,
            keyResultCount: krs.length,
            overallProgressPercent,
          };
        }),
      );
    },
  };
}
