import { logger } from "../middleware/logger.js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const MAX_BATCH_SIZE = 128;

export interface EmbeddingService {
  /** Generate embeddings for an array of texts */
  embed(texts: string[]): Promise<number[][]>;
  /** Vector dimension of the model */
  dimension(): number;
  /** Model name */
  model(): string;
}

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

async function callVoyageApi(
  apiKey: string,
  model: string,
  input: string[],
  inputType: "document" | "query",
): Promise<VoyageEmbeddingResponse> {
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      input_type: inputType,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${body}`);
  }

  return (await response.json()) as VoyageEmbeddingResponse;
}

/**
 * Creates an embedding service using Voyage AI models.
 *
 * Uses separate models for indexing vs retrieval (shared embedding space):
 * - indexing: voyage-4-large (highest quality)
 * - retrieval: voyage-4-lite (fast/cheap)
 */
export function createEmbeddingService(config: {
  apiKey: string;
  indexingModel?: string;
  retrievalModel?: string;
}): EmbeddingService & {
  embedForRetrieval(texts: string[]): Promise<number[][]>;
  totalTokensUsed(): number;
} {
  const apiKey = config.apiKey;
  const indexingModel = config.indexingModel ?? "voyage-4-large";
  const retrievalModel = config.retrievalModel ?? "voyage-4-lite";
  let totalTokens = 0;

  async function embedBatch(
    texts: string[],
    model: string,
    inputType: "document" | "query",
  ): Promise<number[][]> {
    const allEmbeddings: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const result = await callVoyageApi(apiKey, model, batch, inputType);

      totalTokens += result.usage.total_tokens;

      for (const item of result.data) {
        allEmbeddings[i + item.index] = item.embedding;
      }
    }

    return allEmbeddings;
  }

  return {
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      logger.debug({ count: texts.length, model: indexingModel }, "Generating indexing embeddings");
      return embedBatch(texts, indexingModel, "document");
    },

    async embedForRetrieval(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      logger.debug({ count: texts.length, model: retrievalModel }, "Generating retrieval embeddings");
      return embedBatch(texts, retrievalModel, "query");
    },

    dimension() {
      return 1024;
    },

    model() {
      return indexingModel;
    },

    totalTokensUsed() {
      return totalTokens;
    },
  };
}
