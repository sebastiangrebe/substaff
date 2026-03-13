import { readConfigFile } from "./config-file.js";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { resolveSubstaffEnvPath } from "./paths.js";
import {
  DEPLOYMENT_MODES,
  type DeploymentMode,
} from "@substaff/shared";

const SUBSTAFF_ENV_FILE_PATH = resolveSubstaffEnvPath();
if (existsSync(SUBSTAFF_ENV_FILE_PATH)) {
  loadDotenv({ path: SUBSTAFF_ENV_FILE_PATH, override: false, quiet: true });
}

export interface Config {
  deploymentMode: DeploymentMode;
  host: string;
  port: number;
  authPublicBaseUrl: string | undefined;
  databaseUrl: string;
  serveUi: boolean;
  uiDevMiddleware: boolean;
  storageS3Bucket: string;
  storageS3Region: string;
  storageS3Endpoint: string | undefined;
  storageS3Prefix: string;
  storageS3ForcePathStyle: boolean;
  redisUrl: string | undefined;
  qdrantUrl: string | undefined;
  qdrantApiKey: string | undefined;
  voyageApiKey: string | undefined;
  voyageIndexingModel: string;
  voyageRetrievalModel: string;
  heartbeatSchedulerEnabled: boolean;
  heartbeatSchedulerIntervalMs: number;
  companyDeletionEnabled: boolean;
  maxSignupUsers: number | undefined;
}

export function loadConfig(): Config {
  const fileConfig = readConfigFile();

  const databaseUrl =
    process.env.DATABASE_URL ?? fileConfig?.database.connectionString;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable or database.connectionString in config file is required.",
    );
  }

  const fileStorage = fileConfig?.storage;
  const storageS3Bucket = process.env.SUBSTAFF_STORAGE_S3_BUCKET ?? fileStorage?.s3?.bucket ?? "substaff";
  const storageS3Region = process.env.SUBSTAFF_STORAGE_S3_REGION ?? fileStorage?.s3?.region ?? "us-east-1";
  const storageS3Endpoint = process.env.SUBSTAFF_STORAGE_S3_ENDPOINT ?? fileStorage?.s3?.endpoint ?? undefined;
  const storageS3Prefix = process.env.SUBSTAFF_STORAGE_S3_PREFIX ?? fileStorage?.s3?.prefix ?? "";
  const storageS3ForcePathStyle =
    process.env.SUBSTAFF_STORAGE_S3_FORCE_PATH_STYLE !== undefined
      ? process.env.SUBSTAFF_STORAGE_S3_FORCE_PATH_STYLE === "true"
      : (fileStorage?.s3?.forcePathStyle ?? false);

  const deploymentModeFromEnvRaw = process.env.SUBSTAFF_DEPLOYMENT_MODE;
  const deploymentModeFromEnv =
    deploymentModeFromEnvRaw && DEPLOYMENT_MODES.includes(deploymentModeFromEnvRaw as DeploymentMode)
      ? (deploymentModeFromEnvRaw as DeploymentMode)
      : null;
  const deploymentMode: DeploymentMode = deploymentModeFromEnv ?? fileConfig?.server.deploymentMode ?? "authenticated";
  const authPublicBaseUrlRaw =
    process.env.SUBSTAFF_AUTH_PUBLIC_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    fileConfig?.auth?.publicBaseUrl;
  const authPublicBaseUrl = authPublicBaseUrlRaw?.trim() || undefined;
  const companyDeletionEnvRaw = process.env.SUBSTAFF_ENABLE_COMPANY_DELETION;
  const companyDeletionEnabled =
    companyDeletionEnvRaw !== undefined
      ? companyDeletionEnvRaw === "true"
      : false;

  const maxSignupUsersRaw = process.env.SUBSTAFF_MAX_SIGNUP_USERS;
  const maxSignupUsers = maxSignupUsersRaw ? Number(maxSignupUsersRaw) : undefined;

  return {
    deploymentMode,
    host: process.env.HOST ?? fileConfig?.server.host ?? "0.0.0.0",
    port: Number(process.env.PORT) || fileConfig?.server.port || 3100,
    authPublicBaseUrl,
    databaseUrl,
    serveUi:
      process.env.SERVE_UI !== undefined
        ? process.env.SERVE_UI === "true"
        : fileConfig?.server.serveUi ?? true,
    uiDevMiddleware: process.env.SUBSTAFF_UI_DEV_MIDDLEWARE === "true",
    storageS3Bucket,
    storageS3Region,
    storageS3Endpoint,
    storageS3Prefix,
    storageS3ForcePathStyle,
    redisUrl: process.env.REDIS_URL ?? fileConfig?.redis?.url ?? undefined,
    qdrantUrl: process.env.QDRANT_URL ?? fileConfig?.qdrant?.url ?? undefined,
    qdrantApiKey: process.env.QDRANT_API_KEY ?? fileConfig?.qdrant?.apiKey ?? undefined,
    voyageApiKey: process.env.VOYAGE_API_KEY ?? fileConfig?.voyage?.apiKey ?? undefined,
    voyageIndexingModel: process.env.VOYAGE_INDEXING_MODEL ?? fileConfig?.voyage?.indexingModel ?? "voyage-4-large",
    voyageRetrievalModel: process.env.VOYAGE_RETRIEVAL_MODEL ?? fileConfig?.voyage?.retrievalModel ?? "voyage-4-lite",
    heartbeatSchedulerEnabled: process.env.HEARTBEAT_SCHEDULER_ENABLED !== "false",
    heartbeatSchedulerIntervalMs: Math.max(10000, Number(process.env.HEARTBEAT_SCHEDULER_INTERVAL_MS) || 30000),
    companyDeletionEnabled,
    maxSignupUsers,
  };
}
