import * as p from "@clack/prompts";
import pc from "picocolors";
import { configExists, readConfig, resolveConfigPath, writeConfig } from "../config/store.js";
import type { SubstaffConfig } from "../config/schema.js";
import { ensureAgentJwtSecret, resolveAgentJwtEnvFile } from "../config/env.js";
import { promptDatabase } from "../prompts/database.js";
import { promptLlm } from "../prompts/llm.js";
import { promptLogging } from "../prompts/logging.js";
import { defaultStorageConfig, promptStorage } from "../prompts/storage.js";
import { promptServer } from "../prompts/server.js";
import {
  describeLocalInstancePaths,
  resolveDefaultLogsDir,
  resolveSubstaffInstanceId,
} from "../config/home.js";
import { bootstrapCeoInvite } from "./auth-bootstrap-ceo.js";
import { printSubstaffCliBanner } from "../utils/banner.js";

type SetupMode = "quickstart" | "advanced";

type OnboardOptions = {
  config?: string;
  run?: boolean;
  yes?: boolean;
  invokedByRun?: boolean;
};

function quickstartDefaults(): Pick<SubstaffConfig, "database" | "logging" | "server" | "auth" | "storage" | "redis" | "e2b" | "stripe" | "qdrant" | "voyage"> {
  const instanceId = resolveSubstaffInstanceId();
  return {
    database: {
      connectionString: "postgres://substaff:substaff@127.0.0.1:5432/substaff",
    },
    logging: {
      mode: "file",
      logDir: resolveDefaultLogsDir(instanceId),
    },
    server: {
      deploymentMode: "authenticated",
      host: "0.0.0.0",
      port: 3100,
      serveUi: true,
    },
    auth: {},
    storage: defaultStorageConfig(),
    redis: { url: "redis://localhost:6379" },
    e2b: { defaultTemplate: "base" },
    stripe: {},
    qdrant: {},
    voyage: { indexingModel: "voyage-4-large", retrievalModel: "voyage-4-lite" },
  };
}

export async function onboard(opts: OnboardOptions): Promise<void> {
  printSubstaffCliBanner();
  p.intro(pc.bgCyan(pc.black(" substaff onboard ")));
  const configPath = resolveConfigPath(opts.config);
  const instance = describeLocalInstancePaths(resolveSubstaffInstanceId());
  p.log.message(
    pc.dim(
      `Local home: ${instance.homeDir} | instance: ${instance.instanceId} | config: ${configPath}`,
    ),
  );

  if (configExists(opts.config)) {
    p.log.message(pc.dim(`${configPath} exists, updating config`));

    try {
      readConfig(opts.config);
    } catch (err) {
      p.log.message(
        pc.yellow(
          `Existing config appears invalid and will be updated.\n${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  }

  let setupMode: SetupMode = "quickstart";
  if (opts.yes) {
    p.log.message(pc.dim("`--yes` enabled: using Quickstart defaults."));
  } else {
    const setupModeChoice = await p.select({
      message: "Choose setup path",
      options: [
        {
          value: "quickstart" as const,
          label: "Quickstart",
          hint: "Recommended: sensible defaults + ready to run",
        },
        {
          value: "advanced" as const,
          label: "Advanced setup",
          hint: "Customize database, server, storage, and more",
        },
      ],
      initialValue: "quickstart",
    });
    if (p.isCancel(setupModeChoice)) {
      p.cancel("Setup cancelled.");
      return;
    }
    setupMode = setupModeChoice as SetupMode;
  }

  let llm: SubstaffConfig["llm"] | undefined;
  let {
    database,
    logging,
    server,
    auth,
    storage,
  } = quickstartDefaults();

  if (setupMode === "advanced") {
    p.log.step(pc.bold("Database"));
    database = await promptDatabase(database);

    if (database.connectionString) {
      const s = p.spinner();
      s.start("Testing database connection...");
      try {
        const { createDb } = await import("@substaff/db");
        const db = createDb(database.connectionString);
        await db.execute("SELECT 1");
        s.stop("Database connection successful");
      } catch {
        s.stop(pc.yellow("Could not connect to database — you can fix this later with `substaff doctor`"));
      }
    }

    p.log.step(pc.bold("LLM Provider"));
    llm = await promptLlm();

    if (llm?.apiKey) {
      const s = p.spinner();
      s.start("Validating API key...");
      try {
        if (llm.provider === "claude") {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": llm.apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (res.ok || res.status === 400) {
            s.stop("API key is valid");
          } else if (res.status === 401) {
            s.stop(pc.yellow("API key appears invalid — you can update it later"));
          } else {
            s.stop(pc.yellow("Could not validate API key — continuing anyway"));
          }
        } else {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${llm.apiKey}` },
          });
          if (res.ok) {
            s.stop("API key is valid");
          } else if (res.status === 401) {
            s.stop(pc.yellow("API key appears invalid — you can update it later"));
          } else {
            s.stop(pc.yellow("Could not validate API key — continuing anyway"));
          }
        }
      } catch {
        s.stop(pc.yellow("Could not reach API — continuing anyway"));
      }
    }

    p.log.step(pc.bold("Logging"));
    logging = await promptLogging();

    p.log.step(pc.bold("Server"));
    ({ server, auth } = await promptServer());

    p.log.step(pc.bold("Storage"));
    storage = await promptStorage(defaultStorageConfig());
  } else {
    p.log.step(pc.bold("Quickstart"));
    p.log.message(
      pc.dim("Using defaults: PostgreSQL database, no LLM provider, S3 storage."),
    );
  }

  const jwtSecret = ensureAgentJwtSecret(configPath);
  const envFilePath = resolveAgentJwtEnvFile(configPath);
  if (jwtSecret.created) {
    p.log.success(`Created ${pc.cyan("SUBSTAFF_AGENT_JWT_SECRET")} in ${pc.dim(envFilePath)}`);
  } else if (process.env.SUBSTAFF_AGENT_JWT_SECRET?.trim()) {
    p.log.info(`Using existing ${pc.cyan("SUBSTAFF_AGENT_JWT_SECRET")} from environment`);
  } else {
    p.log.info(`Using existing ${pc.cyan("SUBSTAFF_AGENT_JWT_SECRET")} in ${pc.dim(envFilePath)}`);
  }

  const config: SubstaffConfig = {
    $meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: "onboard",
    },
    ...(llm && { llm }),
    database,
    logging,
    server,
    auth,
    storage,
    redis: { url: "redis://localhost:6379" },
    e2b: { defaultTemplate: "base" },
    stripe: {},
    qdrant: {},
    voyage: { indexingModel: "voyage-4-large", retrievalModel: "voyage-4-lite" },
  };

  writeConfig(config, opts.config);

  p.note(
    [
      `Database: ${database.connectionString ? "PostgreSQL" : "not configured"}`,
      llm ? `LLM: ${llm.provider}` : "LLM: not configured",
      `Logging: ${logging?.mode ?? "default"}${logging?.logDir ? ` -> ${logging.logDir}` : ""}`,
      `Server: ${server.deploymentMode} @ ${server.host}:${server.port}`,
      `Auth: ${auth.publicBaseUrl ? auth.publicBaseUrl : "auto"}`,
      `Storage: S3 (bucket=${storage.s3.bucket})`,
      "Agent auth: SUBSTAFF_AGENT_JWT_SECRET configured",
    ].join("\n"),
    "Configuration saved",
  );

  p.note(
    [
      `Run: ${pc.cyan("substaff run")}`,
      `Reconfigure later: ${pc.cyan("substaff configure")}`,
      `Diagnose setup: ${pc.cyan("substaff doctor")}`,
    ].join("\n"),
    "Next commands",
  );

  if (server.deploymentMode === "authenticated") {
    p.log.step("Generating bootstrap CEO invite");
    await bootstrapCeoInvite({ config: configPath });
  }

  let shouldRunNow = opts.run === true || opts.yes === true;
  if (!shouldRunNow && !opts.invokedByRun && process.stdin.isTTY && process.stdout.isTTY) {
    const answer = await p.confirm({
      message: "Start Substaff now?",
      initialValue: true,
    });
    if (!p.isCancel(answer)) {
      shouldRunNow = answer;
    }
  }

  if (shouldRunNow && !opts.invokedByRun) {
    process.env.SUBSTAFF_OPEN_ON_LISTEN = "true";
    const { runCommand } = await import("./run.js");
    await runCommand({ config: configPath, repair: true, yes: true });
    return;
  }

  p.outro("You're all set!");
}
