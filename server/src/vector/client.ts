import { QdrantClient } from "@qdrant/js-client-rest";
import { loadConfig } from "../config.js";
import { logger } from "../middleware/logger.js";

let cachedClient: QdrantClient | null = null;
let cachedUrl: string | null = null;

export function getQdrantClient(): QdrantClient | null {
  const config = loadConfig();
  if (!config.qdrantUrl) return null;

  if (cachedClient && cachedUrl === config.qdrantUrl) {
    return cachedClient;
  }

  cachedClient = new QdrantClient({
    url: config.qdrantUrl,
    apiKey: config.qdrantApiKey ?? undefined,
  });
  cachedUrl = config.qdrantUrl;
  logger.info({ url: config.qdrantUrl }, "Qdrant client initialized");
  return cachedClient;
}

export function isVectorSearchEnabled(): boolean {
  const config = loadConfig();
  return !!config.qdrantUrl;
}
