import { Router } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { indexedArtifacts } from "@substaff/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";
import { getQdrantClient, isVectorSearchEnabled, createEmbeddingService, createRagService } from "../vector/index.js";
import { COLLECTION_NAME } from "../vector/collections.js";
import { indexRunArtifacts } from "../vector/indexing-service.js";
import { loadConfig } from "../config.js";
import { logger } from "../middleware/logger.js";

export function knowledgeRoutes(db: Db) {
  const router = Router();

  // GET /api/companies/:companyId/knowledge/search — semantic search
  router.get("/companies/:companyId/knowledge/search", async (req, res) => {
    const companyId = req.params.companyId!;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

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
    const ragService = createRagService({ qdrant, embeddingService });

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
    assertCompanyAccess(req, companyId);
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
    assertCompanyAccess(req, companyId);
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
    assertCompanyAccess(req, companyId);
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

  // DELETE /api/companies/:companyId/knowledge/artifacts/:artifactId
  router.delete("/companies/:companyId/knowledge/artifacts/:artifactId", async (req, res) => {
    const companyId = req.params.companyId!;
    assertCompanyAccess(req, companyId);
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
