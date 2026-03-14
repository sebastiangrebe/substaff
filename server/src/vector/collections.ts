import type { QdrantClient } from "@qdrant/js-client-rest";
import { logger } from "../middleware/logger.js";

export const COLLECTION_NAME = "substaff_artifacts";
const VECTOR_DIMENSION = 1024; // Voyage 4 models output 1024 dimensions

export async function ensureCollections(client: QdrantClient): Promise<void> {
  try {
    const exists = await client.collectionExists(COLLECTION_NAME);
    if (exists.exists) {
      logger.info({ collection: COLLECTION_NAME }, "Qdrant collection already exists");
      return;
    }

    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_DIMENSION,
        distance: "Cosine",
      },
    });

    // Create payload indices for efficient filtered search
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "company_id",
      field_schema: {
        type: "keyword",
        is_tenant: true,
      },
    });
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "project_id",
      field_schema: "keyword",
    });
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "artifact_type",
      field_schema: "keyword",
    });
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: "agent_id",
      field_schema: "keyword",
    });

    logger.info({ collection: COLLECTION_NAME, dimensions: VECTOR_DIMENSION }, "Qdrant collection created");
  } catch (err) {
    logger.error({ err, collection: COLLECTION_NAME }, "Failed to ensure Qdrant collection");
    throw err;
  }
}
