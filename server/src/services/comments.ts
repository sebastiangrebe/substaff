import { and, asc, desc, eq, gt } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { comments } from "@substaff/db";

export function commentService(db: Db) {
  return {
    list: (linkType: string, linkId: string, opts?: { limit?: number; since?: string }) => {
      const conditions = [eq(comments.linkType, linkType), eq(comments.linkId, linkId)];
      if (opts?.since) {
        conditions.push(gt(comments.createdAt, new Date(opts.since)));
      }
      return db
        .select()
        .from(comments)
        .where(and(...conditions))
        .orderBy(asc(comments.createdAt))
        .limit(opts?.limit ?? 1000);
    },

    getById: (commentId: string) =>
      db
        .select()
        .from(comments)
        .where(eq(comments.id, commentId))
        .then((rows) => rows[0] ?? null),

    add: async (
      companyId: string,
      linkType: string,
      linkId: string,
      body: string,
      actor: { agentId?: string; userId?: string },
    ) => {
      const [comment] = await db
        .insert(comments)
        .values({
          companyId,
          linkType,
          linkId,
          authorAgentId: actor.agentId ?? null,
          authorUserId: actor.userId ?? null,
          body,
        })
        .returning();
      return comment;
    },
  };
}
