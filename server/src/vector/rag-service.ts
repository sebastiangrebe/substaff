import type { QdrantClient } from "@qdrant/js-client-rest";
import type { EmbeddingService } from "./embedding-service.js";
import { COLLECTION_NAME } from "./collections.js";
import { logger } from "../middleware/logger.js";

export interface RagResult {
  score: number;
  filePath: string;
  contentPreview: string;
  artifactType: string;
  agentId: string | null;
  issueId: string | null;
  projectId: string | null;
  chunkIndex: number;
  chunkTotal: number;
  language: string | null;
}

export interface RagQueryOptions {
  /** Required — multi-tenant isolation */
  companyId: string;
  /** Optional project-level filter */
  projectId?: string;
  /** Optional artifact type filter */
  artifactTypes?: string[];
  /** Number of results (default 10) */
  topK?: number;
}

export function createRagService(deps: {
  qdrant: QdrantClient;
  embeddingService: EmbeddingService & { embedForRetrieval(texts: string[]): Promise<number[][]> };
}) {
  const { qdrant, embeddingService } = deps;

  return {
    async queryRelevantContext(
      query: string,
      opts: RagQueryOptions,
    ): Promise<RagResult[]> {
      const topK = opts.topK ?? 10;

      // Generate query embedding using the retrieval model (voyage-4-lite)
      const [queryVector] = await embeddingService.embedForRetrieval([query]);
      if (!queryVector) return [];

      // Build filter — company_id is ALWAYS required
      const must: Array<Record<string, unknown>> = [
        { key: "company_id", match: { value: opts.companyId } },
      ];
      if (opts.projectId) {
        must.push({ key: "project_id", match: { value: opts.projectId } });
      }
      if (opts.artifactTypes?.length) {
        must.push({
          key: "artifact_type",
          match: { any: opts.artifactTypes },
        });
      }

      try {
        const results = await qdrant.search(COLLECTION_NAME, {
          vector: queryVector,
          limit: topK,
          filter: { must },
          with_payload: true,
        });

        return results.map((r) => {
          const p = r.payload ?? {};
          return {
            score: r.score,
            filePath: String(p.file_path ?? ""),
            contentPreview: String(p.content_preview ?? ""),
            artifactType: String(p.artifact_type ?? ""),
            agentId: p.agent_id ? String(p.agent_id) : null,
            issueId: p.issue_id ? String(p.issue_id) : null,
            projectId: p.project_id ? String(p.project_id) : null,
            chunkIndex: Number(p.chunk_index ?? 0),
            chunkTotal: Number(p.chunk_total ?? 1),
            language: p.language ? String(p.language) : null,
          };
        });
      } catch (err) {
        logger.error({ err, companyId: opts.companyId }, "RAG query failed");
        return [];
      }
    },
  };
}
