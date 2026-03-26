import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
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
  agentId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  issueId?: string | null;
}

interface IndexCommentOptions {
  companyId: string;
  agentId: string;
  linkType: string;
  linkId: string;
  commentId: string;
  /** @deprecated Use linkId instead */
  issueId?: string;
  projectId?: string | null;
  runId?: string | null;
}

/**
 * Index an agent's comment into Qdrant for future knowledge search.
 * Fire-and-forget — swallows errors and logs them.
 */
export async function indexComment(
  body: string,
  opts: IndexCommentOptions,
): Promise<void> {
  const client = getQdrantClient();
  if (!client) return;

  const config = loadConfig();
  if (!config.voyageApiKey) return;

  const embeddingService = createEmbeddingService({ apiKey: config.voyageApiKey });

  // Comments are typically short; use markdown chunking for longer ones
  const contentChunks = chunkContent(body, "comment.md");
  const chunkTexts = contentChunks.map((c) => c.text);
  const embeddings = await embeddingService.embed(chunkTexts);

  const points = embeddings.map((vector, i) => ({
    id: randomUUID(),
    vector,
    payload: {
      company_id: opts.companyId,
      project_id: opts.projectId ?? null,
      agent_id: opts.agentId,
      link_type: opts.linkType,
      link_id: opts.linkId,
      issue_id: opts.issueId ?? (opts.linkType === "issue" ? opts.linkId : null),
      run_id: opts.runId ?? null,
      comment_id: opts.commentId,
      artifact_type: "comment",
      file_path: "",
      file_name: "",
      chunk_index: contentChunks[i].index,
      chunk_total: contentChunks[i].total,
      content_preview: chunkTexts[i].slice(0, 500),
      language: null,
      indexed_at: new Date().toISOString(),
    },
  }));

  for (let i = 0; i < points.length; i += 100) {
    await client.upsert(COLLECTION_NAME, {
      points: points.slice(i, i + 100),
    });
  }

  logger.info(
    { companyId: opts.companyId, commentId: opts.commentId, chunks: contentChunks.length },
    "Comment indexed into vector DB",
  );
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

  // List all files under the company's workspace (recursive to traverse nested dirs)
  const prefix = opts.projectId ? `${opts.projectId}/` : "";
  const listing = await storage.listObjects(opts.companyId, prefix, { recursive: true });

  let indexed = 0;
  let skipped = 0;
  let totalChunks = 0;

  for (const obj of listing.objects) {
    if (!shouldIndex(obj.key, obj.size)) {
      skipped++;
      continue;
    }

    try {
      // Deduplicate: remove previous vectors for this file before re-indexing
      const [existing] = await db
        .select({ id: indexedArtifacts.id, qdrantPointIds: indexedArtifacts.qdrantPointIds })
        .from(indexedArtifacts)
        .where(
          and(
            eq(indexedArtifacts.companyId, opts.companyId),
            eq(indexedArtifacts.objectKey, obj.key),
          ),
        )
        .limit(1);

      if (existing) {
        // Delete old vectors from Qdrant
        if (existing.qdrantPointIds?.length) {
          try {
            await client.delete(COLLECTION_NAME, { points: existing.qdrantPointIds });
          } catch (err) {
            logger.warn({ err, objectKey: obj.key }, "Failed to delete old Qdrant points");
          }
        }
        // Delete old DB record
        await db.delete(indexedArtifacts).where(eq(indexedArtifacts.id, existing.id));
      }

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
            agent_id: opts.agentId ?? null,
            issue_id: opts.issueId ?? null,
            run_id: opts.runId ?? null,
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
        agentId: opts.agentId ?? null,
        projectId: opts.projectId ?? null,
        issueId: opts.issueId ?? null,
        runId: opts.runId ?? null,
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
