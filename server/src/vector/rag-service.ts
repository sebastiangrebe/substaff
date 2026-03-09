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

const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
const RERANK_MODEL = "rerank-2.5";
// Fetch more candidates from Qdrant, then rerank down to topK
const RERANK_OVERSAMPLE = 3;

interface VoyageRerankResponse {
  object: string;
  data: Array<{ index: number; relevance_score: number }>;
  model: string;
  usage: { total_tokens: number };
}

async function voyageRerank(
  apiKey: string,
  query: string,
  documents: string[],
  topK: number,
): Promise<VoyageRerankResponse> {
  const response = await fetch(VOYAGE_RERANK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: RERANK_MODEL,
      query,
      documents,
      top_k: topK,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage rerank error ${response.status}: ${body}`);
  }

  return (await response.json()) as VoyageRerankResponse;
}

export function createRagService(deps: {
  qdrant: QdrantClient;
  embeddingService: EmbeddingService & { embedForRetrieval(texts: string[]): Promise<number[][]> };
  voyageApiKey?: string;
}) {
  const { qdrant, embeddingService, voyageApiKey } = deps;

  return {
    async queryRelevantContext(
      query: string,
      opts: RagQueryOptions,
    ): Promise<RagResult[]> {
      const topK = opts.topK ?? 10;
      // If reranking, fetch more candidates to improve recall
      const fetchLimit = voyageApiKey ? topK * RERANK_OVERSAMPLE : topK;

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
          limit: fetchLimit,
          filter: { must },
          with_payload: true,
        });

        if (results.length === 0) return [];

        // Map Qdrant results to intermediate format
        const candidates = results.map((r) => {
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

        // Rerank with Voyage if API key is available
        if (voyageApiKey && candidates.length > 1) {
          try {
            const documents = candidates.map((c) => c.contentPreview);
            const reranked = await voyageRerank(voyageApiKey, query, documents, topK);

            return reranked.data.map((item) => ({
              ...candidates[item.index],
              score: item.relevance_score,
            }));
          } catch (err) {
            // Reranking failed — fall back to vector similarity order
            logger.warn({ err, companyId: opts.companyId }, "Voyage rerank failed, using vector similarity");
          }
        }

        // No reranking — return vector similarity results, trimmed to topK
        return candidates.slice(0, topK);
      } catch (err) {
        logger.error({ err, companyId: opts.companyId }, "RAG query failed");
        return [];
      }
    },
  };
}
