import { randomUUID } from "node:crypto";
import { eq, and, count, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { indexedArtifacts, issueComments, issues } from "@substaff/db";
import { assertBoard, companyRouter } from "./authz.js";
import { badRequest } from "../errors.js";
import { getQdrantClient, isVectorSearchEnabled, createEmbeddingService, createRagService, indexComment } from "../vector/index.js";
import { COLLECTION_NAME } from "../vector/collections.js";
import { indexRunArtifacts } from "../vector/indexing-service.js";
import { chunkContent } from "../vector/chunker.js";
import { loadConfig } from "../config.js";
import { logger } from "../middleware/logger.js";

export function knowledgeRoutes(db: Db) {
  const router = companyRouter();

  // GET /api/companies/:companyId/knowledge/search — semantic search (agents + board)
  router.get("/companies/:companyId/knowledge/search", async (req, res) => {
    const companyId = req.params.companyId!;
    // No assertBoard — agents need knowledge search for cross-run context

    if (!isVectorSearchEnabled()) {
      res.status(501).json({ error: "Vector search not configured" });
      return;
    }

    const query = req.query.q as string | undefined;
    if (!query?.trim()) {
      throw badRequest("Query parameter 'q' is required");
    }

    const config = loadConfig();
    if (!config.voyageApiKey) {
      res.status(501).json({ error: "Voyage API key not configured" });
      return;
    }

    const qdrant = getQdrantClient()!;
    const embeddingService = createEmbeddingService({
      apiKey: config.voyageApiKey,
      indexingModel: config.voyageIndexingModel,
      retrievalModel: config.voyageRetrievalModel,
    });
    const ragService = createRagService({ qdrant, embeddingService, voyageApiKey: config.voyageApiKey });

    const results = await ragService.queryRelevantContext(query, {
      companyId,
      projectId: req.query.projectId as string | undefined,
      artifactTypes: req.query.artifactType
        ? [req.query.artifactType as string]
        : undefined,
      topK: Math.min(Number(req.query.limit) || 10, 50),
    });

    res.json({ results });
  });

  // GET /api/companies/:companyId/knowledge/stats — indexing statistics
  router.get("/companies/:companyId/knowledge/stats", async (req, res) => {
    const companyId = req.params.companyId!;
    assertBoard(req);

    const [totalResult] = await db
      .select({ count: count() })
      .from(indexedArtifacts)
      .where(eq(indexedArtifacts.companyId, companyId));

    const byType = await db
      .select({
        artifactType: indexedArtifacts.artifactType,
        count: count(),
      })
      .from(indexedArtifacts)
      .where(eq(indexedArtifacts.companyId, companyId))
      .groupBy(indexedArtifacts.artifactType);

    res.json({
      total: totalResult?.count ?? 0,
      byType: byType.map((r) => ({ type: r.artifactType, count: r.count })),
      vectorSearchEnabled: isVectorSearchEnabled(),
    });
  });

  // GET /api/companies/:companyId/knowledge/artifacts — list indexed artifacts
  router.get("/companies/:companyId/knowledge/artifacts", async (req, res) => {
    const companyId = req.params.companyId!;
    assertBoard(req);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const conditions = [eq(indexedArtifacts.companyId, companyId)];
    if (req.query.projectId) {
      conditions.push(eq(indexedArtifacts.projectId, req.query.projectId as string));
    }
    if (req.query.artifactType) {
      conditions.push(eq(indexedArtifacts.artifactType, req.query.artifactType as string));
    }

    const artifacts = await db
      .select()
      .from(indexedArtifacts)
      .where(and(...conditions))
      .orderBy(indexedArtifacts.indexedAt)
      .limit(limit)
      .offset(offset);

    res.json({ artifacts });
  });

  // POST /api/companies/:companyId/knowledge/reindex — trigger re-indexing
  router.post("/companies/:companyId/knowledge/reindex", async (req, res) => {
    const companyId = req.params.companyId!;
    assertBoard(req);

    if (!isVectorSearchEnabled()) {
      res.status(501).json({ error: "Vector search not configured" });
      return;
    }

    const { agentId, projectId, runId } = req.body as {
      agentId?: string;
      projectId?: string;
      runId?: string;
    };

    if (!agentId) {
      throw badRequest("agentId is required for reindexing");
    }

    // Fire-and-forget — return immediately
    void indexRunArtifacts(db, {
      companyId,
      agentId,
      runId: runId ?? "reindex",
      projectId,
    }).catch((err) => {
      logger.error({ err, companyId }, "Reindex failed");
    });

    res.json({ status: "reindexing_started" });
  });

  // POST /api/companies/:companyId/knowledge/reindex-all — re-embed all files + comments
  router.post("/companies/:companyId/knowledge/reindex-all", async (req, res) => {
    const companyId = req.params.companyId!;
    assertBoard(req);

    if (!isVectorSearchEnabled()) {
      res.status(501).json({ error: "Vector search not configured" });
      return;
    }

    // Respond immediately — all work happens in background
    res.json({ status: "reindexing_all_started" });

    // Detach background work from the request lifecycle
    setImmediate(() => {
      void (async () => {
        try {
          const config = loadConfig();
          if (!config.voyageApiKey) return;

          const client = getQdrantClient();

          // 1. Delete all existing vectors for this company from Qdrant
          if (client) {
            await client.delete(COLLECTION_NAME, {
              filter: { must: [{ key: "company_id", match: { value: companyId } }] },
            });
            logger.info({ companyId }, "Cleared existing vectors for company");
          }

          // 2. Delete all indexed_artifacts records for this company
          await db.delete(indexedArtifacts).where(eq(indexedArtifacts.companyId, companyId));

          // 3. Re-index all file artifacts from storage
          await indexRunArtifacts(db, {
            companyId,
          });

          // 4. Re-index all agent comments — batch embeddings for speed
          const comments = await db
            .select({
              id: issueComments.id,
              body: issueComments.body,
              issueId: issueComments.issueId,
              authorAgentId: issueComments.authorAgentId,
              projectId: issues.projectId,
            })
            .from(issueComments)
            .innerJoin(issues, eq(issueComments.issueId, issues.id))
            .where(
              and(
                eq(issueComments.companyId, companyId),
                sql`${issueComments.authorAgentId} IS NOT NULL`,
              ),
            );

          if (comments.length > 0) {
            const embeddingService = createEmbeddingService({ apiKey: config.voyageApiKey });

            // Chunk all comments, then batch-embed all chunks at once
            const commentChunks = comments.map((c) => ({
              comment: c,
              chunks: chunkContent(c.body, "comment.md"),
            }));

            const allChunkTexts = commentChunks.flatMap((cc) =>
              cc.chunks.map((ch) => ch.text),
            );

            const allEmbeddings = await embeddingService.embed(allChunkTexts);

            // Build Qdrant points from the flat embeddings array
            let embIdx = 0;
            const allPoints: Array<{
              id: string;
              vector: number[];
              payload: Record<string, unknown>;
            }> = [];

            for (const { comment, chunks } of commentChunks) {
              for (const chunk of chunks) {
                allPoints.push({
                  id: randomUUID(),
                  vector: allEmbeddings[embIdx]!,
                  payload: {
                    company_id: companyId,
                    project_id: comment.projectId ?? null,
                    agent_id: comment.authorAgentId,
                    issue_id: comment.issueId,
                    run_id: null,
                    comment_id: comment.id,
                    artifact_type: "comment",
                    file_path: "",
                    file_name: "",
                    chunk_index: chunk.index,
                    chunk_total: chunk.total,
                    content_preview: chunk.text.slice(0, 500),
                    language: null,
                    indexed_at: new Date().toISOString(),
                  },
                });
                embIdx++;
              }
            }

            // Upsert in batches of 100
            if (client) {
              for (let i = 0; i < allPoints.length; i += 100) {
                await client.upsert(COLLECTION_NAME, {
                  points: allPoints.slice(i, i + 100),
                });
              }
            }

            logger.info({ companyId, comments: comments.length, chunks: allPoints.length }, "Reindex-all complete");
          } else {
            logger.info({ companyId, comments: 0 }, "Reindex-all complete (no comments)");
          }
        } catch (err) {
          logger.error({ err, companyId }, "Reindex-all failed");
        }
      })();
    });

    return;
  });

  // DELETE /api/companies/:companyId/knowledge/artifacts/:artifactId
  router.delete("/companies/:companyId/knowledge/artifacts/:artifactId", async (req, res) => {
    const companyId = req.params.companyId!;
    assertBoard(req);

    const [artifact] = await db
      .select()
      .from(indexedArtifacts)
      .where(
        and(
          eq(indexedArtifacts.id, req.params.artifactId!),
          eq(indexedArtifacts.companyId, companyId),
        ),
      );

    if (!artifact) {
      res.status(404).json({ error: "Artifact not found" });
      return;
    }

    // Delete from Qdrant if we have point IDs
    if (artifact.qdrantPointIds?.length) {
      const client = getQdrantClient();
      if (client) {
        try {
          await client.delete(COLLECTION_NAME, {
            points: artifact.qdrantPointIds,
          });
        } catch (err) {
          logger.warn({ err, artifactId: artifact.id }, "Failed to delete Qdrant points");
        }
      }
    }

    // Delete from PostgreSQL
    await db
      .delete(indexedArtifacts)
      .where(eq(indexedArtifacts.id, artifact.id));

    res.json({ deleted: true });
  });

  return router;
}
