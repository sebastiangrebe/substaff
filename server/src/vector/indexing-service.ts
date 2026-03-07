import { randomUUID } from "node:crypto";
import type { Db } from "@substaff/db";
import { indexedArtifacts } from "@substaff/db";
import { getQdrantClient } from "./client.js";
import { COLLECTION_NAME } from "./collections.js";
import { createEmbeddingService } from "./embedding-service.js";
import { chunkContent, shouldIndex, getArtifactType, getLanguage } from "./chunker.js";
import { getStorageService } from "../storage/index.js";
import { loadConfig } from "../config.js";
import { logger } from "../middleware/logger.js";

interface IndexRunOptions {
  companyId: string;
  agentId: string;
  runId: string;
  projectId?: string | null;
  issueId?: string | null;
}

export async function indexRunArtifacts(
  db: Db,
  opts: IndexRunOptions,
): Promise<{ indexed: number; skipped: number; chunks: number }> {
  const client = getQdrantClient();
  if (!client) return { indexed: 0, skipped: 0, chunks: 0 };

  const config = loadConfig();
  const voyageApiKey = config.voyageApiKey;
  if (!voyageApiKey) {
    logger.warn("VOYAGE_API_KEY not set, skipping artifact indexing");
    return { indexed: 0, skipped: 0, chunks: 0 };
  }

  const embeddingService = createEmbeddingService({ apiKey: voyageApiKey });
  const storage = getStorageService();

  // List all files under the company's workspace
  const prefix = opts.projectId ? `${opts.projectId}/` : "";
  const listing = await storage.listObjects(opts.companyId, prefix);

  let indexed = 0;
  let skipped = 0;
  let totalChunks = 0;

  for (const obj of listing.objects) {
    if (!shouldIndex(obj.key, obj.size)) {
      skipped++;
      continue;
    }

    try {
      const fileObj = await storage.getObject(opts.companyId, obj.key);
      const chunks: Buffer[] = [];
      for await (const chunk of fileObj.stream) {
        chunks.push(Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks).toString("utf-8");

      if (!content.trim()) {
        skipped++;
        continue;
      }

      const contentChunks = chunkContent(content, obj.key);
      const chunkTexts = contentChunks.map((c) => c.text);
      const embeddings = await embeddingService.embed(chunkTexts);

      const artifactType = getArtifactType(obj.key);
      const language = getLanguage(obj.key);
      const pointIds: string[] = [];

      const points = embeddings.map((vector, i) => {
        const pointId = randomUUID();
        pointIds.push(pointId);
        return {
          id: pointId,
          vector,
          payload: {
            company_id: opts.companyId,
            project_id: opts.projectId ?? null,
            agent_id: opts.agentId,
            issue_id: opts.issueId ?? null,
            run_id: opts.runId,
            artifact_type: artifactType,
            file_path: obj.key,
            file_name: obj.key.split("/").pop() ?? obj.key,
            chunk_index: contentChunks[i].index,
            chunk_total: contentChunks[i].total,
            content_preview: chunkTexts[i].slice(0, 500),
            language: language ?? null,
            indexed_at: new Date().toISOString(),
          },
        };
      });

      // Upsert in batches of 100
      for (let i = 0; i < points.length; i += 100) {
        await client.upsert(COLLECTION_NAME, {
          points: points.slice(i, i + 100),
        });
      }

      // Track in PostgreSQL
      await db.insert(indexedArtifacts).values({
        companyId: opts.companyId,
        agentId: opts.agentId,
        projectId: opts.projectId ?? null,
        issueId: opts.issueId ?? null,
        runId: opts.runId,
        objectKey: obj.key,
        artifactType,
        chunkCount: contentChunks.length,
        qdrantPointIds: pointIds,
        embeddingModel: embeddingService.model(),
        tokenCount: 0,
        status: "indexed",
      });

      indexed++;
      totalChunks += contentChunks.length;
    } catch (err) {
      logger.warn({ err, objectKey: obj.key }, "Failed to index artifact");
      skipped++;
    }
  }

  logger.info(
    { companyId: opts.companyId, runId: opts.runId, indexed, skipped, chunks: totalChunks },
    "Artifact indexing complete",
  );

  return { indexed, skipped, chunks: totalChunks };
}
