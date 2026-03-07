import { z } from "zod";
import { DEPLOYMENT_MODES } from "./constants.js";

export const configMetaSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  source: z.enum(["onboard", "configure", "doctor"]),
});

export const llmConfigSchema = z.object({
  provider: z.enum(["claude", "openai"]),
  apiKey: z.string().optional(),
});

export const databaseConfigSchema = z.object({
  connectionString: z.string(),
});

export const loggingConfigSchema = z.object({
  mode: z.enum(["file", "cloud"]),
  logDir: z.string().optional(),
});

export const serverConfigSchema = z.object({
  deploymentMode: z.enum(DEPLOYMENT_MODES).default("authenticated"),
  host: z.string().default("0.0.0.0"),
  port: z.number().int().min(1).max(65535).default(3100),
  serveUi: z.boolean().default(true),
});

export const authConfigSchema = z.object({
  publicBaseUrl: z.string().url().optional(),
});

export const storageS3ConfigSchema = z.object({
  bucket: z.string().min(1).default("substaff"),
  region: z.string().min(1).default("us-east-1"),
  endpoint: z.string().optional(),
  prefix: z.string().default(""),
  forcePathStyle: z.boolean().default(false),
});

export const storageConfigSchema = z.object({
  s3: storageS3ConfigSchema.default({
    bucket: "substaff",
    region: "us-east-1",
    prefix: "",
    forcePathStyle: false,
  }),
});

export const redisConfigSchema = z.object({
  url: z.string().default("redis://localhost:6379"),
});

export const e2bConfigSchema = z.object({
  apiKey: z.string().optional(),
  defaultTemplate: z.string().default("base"),
});

export const stripeConfigSchema = z.object({
  secretKey: z.string().optional(),
  webhookSecret: z.string().optional(),
});

export const qdrantConfigSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string().optional(),
});

export const voyageConfigSchema = z.object({
  apiKey: z.string().optional(),
  indexingModel: z.string().default("voyage-4-large"),
  retrievalModel: z.string().default("voyage-4-lite"),
});

export const substaffConfigSchema = z.object({
  $meta: configMetaSchema.optional(),
  llm: llmConfigSchema.optional(),
  database: databaseConfigSchema,
  logging: loggingConfigSchema.optional(),
  server: serverConfigSchema.default({
    deploymentMode: "authenticated",
    host: "0.0.0.0",
    port: 3100,
    serveUi: true,
  }),
  auth: authConfigSchema.default({}),
  storage: storageConfigSchema.default({
    s3: {
      bucket: "substaff",
      region: "us-east-1",
      prefix: "",
      forcePathStyle: false,
    },
  }),
  redis: redisConfigSchema.default({
    url: "redis://localhost:6379",
  }),
  e2b: e2bConfigSchema.default({
    defaultTemplate: "base",
  }),
  stripe: stripeConfigSchema.default({}),
  qdrant: qdrantConfigSchema.default({}),
  voyage: voyageConfigSchema.default({
    indexingModel: "voyage-4-large",
    retrievalModel: "voyage-4-lite",
  }),
});

export type SubstaffConfig = z.infer<typeof substaffConfigSchema>;
export type LlmConfig = z.infer<typeof llmConfigSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type LoggingConfig = z.infer<typeof loggingConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type StorageConfig = z.infer<typeof storageConfigSchema>;
export type StorageS3Config = z.infer<typeof storageS3ConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type ConfigMeta = z.infer<typeof configMetaSchema>;
export type RedisConfig = z.infer<typeof redisConfigSchema>;
export type E2bConfig = z.infer<typeof e2bConfigSchema>;
export type StripeConfig = z.infer<typeof stripeConfigSchema>;
export type QdrantConfig = z.infer<typeof qdrantConfigSchema>;
export type VoyageConfig = z.infer<typeof voyageConfigSchema>;
