/// <reference path="./types/express.d.ts" />
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Request as ExpressRequest, RequestHandler } from "express";
import {
  createDb,
  inspectMigrations,
  applyPendingMigrations,
  reconcilePendingMigrationHistory,
} from "@substaff/db";
import detectPort from "detect-port";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { logger } from "./middleware/logger.js";
import { setupLiveEventsWebSocketServer } from "./realtime/live-events-ws.js";
import { heartbeatService } from "./services/index.js";
import { createStorageServiceFromConfig } from "./storage/index.js";
import { printStartupBanner } from "./startup-banner.js";

type BetterAuthSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

type BetterAuthSessionResult = {
  session: { id: string; userId: string } | null;
  user: BetterAuthSessionUser | null;
};

const config = loadConfig();

type MigrationSummary =
  | "skipped"
  | "already applied"
  | "applied (empty database)"
  | "applied (pending migrations)"
  | "pending migrations skipped";

function formatPendingMigrationSummary(migrations: string[]): string {
  if (migrations.length === 0) return "none";
  return migrations.length > 3
    ? `${migrations.slice(0, 3).join(", ")} (+${migrations.length - 3} more)`
    : migrations.join(", ");
}

async function promptApplyMigrations(migrations: string[]): Promise<boolean> {
  if (process.env.SUBSTAFF_MIGRATION_AUTO_APPLY === "true") return true;
  if (process.env.SUBSTAFF_MIGRATION_PROMPT === "never") return false;
  if (!stdin.isTTY || !stdout.isTTY) return true;

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await prompt.question(
      `Apply pending migrations (${formatPendingMigrationSummary(migrations)}) now? (y/N): `,
    )).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    prompt.close();
  }
}

type EnsureMigrationsOptions = {
  autoApply?: boolean;
};

async function ensureMigrations(
  connectionString: string,
  label: string,
  opts?: EnsureMigrationsOptions,
): Promise<MigrationSummary> {
  const autoApply = opts?.autoApply === true;
  let state = await inspectMigrations(connectionString);
  if (state.status === "needsMigrations" && state.reason === "pending-migrations") {
    const repair = await reconcilePendingMigrationHistory(connectionString);
    if (repair.repairedMigrations.length > 0) {
      logger.warn(
        { repairedMigrations: repair.repairedMigrations },
        `${label} had drifted migration history; repaired migration journal entries from existing schema state.`,
      );
      state = await inspectMigrations(connectionString);
      if (state.status === "upToDate") return "already applied";
    }
  }
  if (state.status === "upToDate") return "already applied";
  if (state.status === "needsMigrations" && state.reason === "no-migration-journal-non-empty-db") {
    logger.warn(
      { tableCount: state.tableCount },
      `${label} has existing tables but no migration journal. Run migrations manually to sync schema.`,
    );
    const apply = autoApply ? true : await promptApplyMigrations(state.pendingMigrations);
    if (!apply) {
      logger.warn(
        { pendingMigrations: state.pendingMigrations },
        `${label} has pending migrations; continuing without applying. Run pnpm db:migrate to apply before startup.`,
      );
      return "pending migrations skipped";
    }

    logger.info({ pendingMigrations: state.pendingMigrations }, `Applying ${state.pendingMigrations.length} pending migrations for ${label}`);
    await applyPendingMigrations(connectionString);
    return "applied (pending migrations)";
  }

  const apply = autoApply ? true : await promptApplyMigrations(state.pendingMigrations);
  if (!apply) {
    logger.warn(
      { pendingMigrations: state.pendingMigrations },
      `${label} has pending migrations; continuing without applying. Run pnpm db:migrate to apply before startup.`,
    );
    return "pending migrations skipped";
  }

  logger.info({ pendingMigrations: state.pendingMigrations }, `Applying ${state.pendingMigrations.length} pending migrations for ${label}`);
  await applyPendingMigrations(connectionString);
  return "applied (pending migrations)";
}

const migrationSummary = await ensureMigrations(config.databaseUrl, "PostgreSQL");
const db = createDb(config.databaseUrl);
logger.info("Using external PostgreSQL via DATABASE_URL/config");
const startupDbInfo = { mode: "external-postgres" as const, connectionString: config.databaseUrl };

// Initialize Redis pub/sub
const { initRedis } = await import("./services/redis.js");
await initRedis(config.redisUrl!);

// Initialize BullMQ queues and workers
const { initQueues } = await import("./queues/index.js");
await initQueues(config.redisUrl!, db as any, {
  heartbeatSchedulerEnabled: config.heartbeatSchedulerEnabled,
  heartbeatSchedulerIntervalMs: config.heartbeatSchedulerIntervalMs,
});

// Initialize email service if configured
if (process.env.RESEND_API_KEY) {
  const { initEmail } = await import("./services/email.js");
  initEmail(process.env.RESEND_API_KEY, process.env.EMAIL_FROM);
}

// Initialize Qdrant vector search if configured
if (config.qdrantUrl) {
  const { getQdrantClient, ensureCollections } = await import("./vector/index.js");
  const qdrantClient = getQdrantClient();
  if (qdrantClient) {
    try {
      await ensureCollections(qdrantClient);
      logger.info("Qdrant vector search initialized");
    } catch (err) {
      logger.warn({ err }, "Qdrant initialization failed — vector search disabled");
    }
  }
}

// No additional deployment mode validation needed; only "authenticated" is supported.

let authReady = false;
let betterAuthHandler: RequestHandler | undefined;
let resolveSession:
  | ((req: ExpressRequest) => Promise<BetterAuthSessionResult | null>)
  | undefined;
let resolveSessionFromHeaders:
  | ((headers: Headers) => Promise<BetterAuthSessionResult | null>)
  | undefined;
{
  const {
    createBetterAuthHandler,
    createBetterAuthInstance,
    resolveBetterAuthSession,
    resolveBetterAuthSessionFromHeaders,
  } = await import("./auth/better-auth.js");
  const betterAuthSecret =
    process.env.BETTER_AUTH_SECRET?.trim() ?? process.env.SUBSTAFF_AGENT_JWT_SECRET?.trim();
  if (!betterAuthSecret) {
    throw new Error(
      "authenticated mode requires BETTER_AUTH_SECRET (or SUBSTAFF_AGENT_JWT_SECRET) to be set",
    );
  }
  const auth = createBetterAuthInstance(db as any, config);
  betterAuthHandler = createBetterAuthHandler(auth);
  resolveSession = (req) => resolveBetterAuthSession(auth, req);
  resolveSessionFromHeaders = (headers) => resolveBetterAuthSessionFromHeaders(auth, headers);
  authReady = true;
}

const uiMode = config.uiDevMiddleware ? "vite-dev" : config.serveUi ? "static" : "none";
const storageService = createStorageServiceFromConfig(config);
const app = await createApp(db as any, {
  uiMode,
  storageService,
  deploymentMode: config.deploymentMode,
  authReady,
  companyDeletionEnabled: config.companyDeletionEnabled,
  betterAuthHandler,
  resolveSession,
});
const server = createServer(app);
const listenPort = await detectPort(config.port);

if (listenPort !== config.port) {
  logger.warn(`Requested port is busy; using next free port (requestedPort=${config.port}, selectedPort=${listenPort})`);
}

const runtimeListenHost = config.host;
const runtimeApiHost =
  runtimeListenHost === "0.0.0.0" || runtimeListenHost === "::"
    ? "localhost"
    : runtimeListenHost;
process.env.SUBSTAFF_LISTEN_HOST = runtimeListenHost;
process.env.SUBSTAFF_LISTEN_PORT = String(listenPort);
process.env.SUBSTAFF_API_URL = `http://${runtimeApiHost}:${listenPort}`;

setupLiveEventsWebSocketServer(server, db as any, {
  deploymentMode: config.deploymentMode,
  resolveSessionFromHeaders,
});

if (config.heartbeatSchedulerEnabled) {
  const heartbeat = heartbeatService(db as any);

  // Reap orphaned runs at startup (no threshold -- runningProcesses is empty).
  // Periodic tick + reap is handled by BullMQ repeatable jobs in heartbeat-scheduler queue.
  void heartbeat.reapOrphanedRuns().catch((err) => {
    logger.error({ err }, "startup reap of orphaned heartbeat runs failed");
  });
}

server.listen(listenPort, config.host, () => {
  logger.info(`Server listening on ${config.host}:${listenPort}`);
  if (process.env.SUBSTAFF_OPEN_ON_LISTEN === "true") {
    const openHost = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host;
    const url = `http://${openHost}:${listenPort}`;
    void import("open")
      .then((mod) => mod.default(url))
      .then(() => {
        logger.info(`Opened browser at ${url}`);
      })
      .catch((err) => {
        logger.warn({ err, url }, "Failed to open browser on startup");
      });
  }
  printStartupBanner({
    host: config.host,
    deploymentMode: config.deploymentMode,
    authReady,
    requestedPort: config.port,
    listenPort,
    uiMode,
    db: startupDbInfo,
    migrationSummary,
    heartbeatSchedulerEnabled: config.heartbeatSchedulerEnabled,
    heartbeatSchedulerIntervalMs: config.heartbeatSchedulerIntervalMs,
  });

});

// ── Graceful shutdown ──────────────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, "Graceful shutdown initiated");

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info("HTTP server closed");
  });

  // 2. Shut down BullMQ workers (waits for in-progress jobs to finish)
  try {
    const { shutdownQueues } = await import("./queues/index.js");
    await shutdownQueues();
  } catch (err) {
    logger.error({ err }, "Error shutting down queues");
  }

  // 3. Shut down Redis pub/sub
  try {
    const { shutdownRedis } = await import("./services/redis.js");
    await shutdownRedis();
  } catch (err) {
    logger.error({ err }, "Error shutting down Redis");
  }

  // 4. Force exit after timeout (safety net for hung jobs)
  const forceExitTimer = setTimeout(() => {
    logger.warn("Shutdown timeout exceeded, forcing exit");
    process.exit(1);
  }, 30_000);
  forceExitTimer.unref();

  logger.info("Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
