import * as p from "@clack/prompts";
import pc from "picocolors";
import { readConfig, writeConfig, configExists, resolveConfigPath } from "../config/store.js";
import type { SubstaffConfig } from "../config/schema.js";
import { promptDatabase } from "../prompts/database.js";
import { promptLlm } from "../prompts/llm.js";
import { promptLogging } from "../prompts/logging.js";
import { defaultStorageConfig, promptStorage } from "../prompts/storage.js";
import { promptServer } from "../prompts/server.js";
import {
  resolveDefaultLogsDir,
  resolveSubstaffInstanceId,
} from "../config/home.js";
import { printSubstaffCliBanner } from "../utils/banner.js";

type Section = "llm" | "database" | "logging" | "server" | "storage";

const SECTION_LABELS: Record<Section, string> = {
  llm: "LLM Provider",
  database: "Database",
  logging: "Logging",
  server: "Server",
  storage: "Storage",
};

function defaultConfig(): SubstaffConfig {
  const instanceId = resolveSubstaffInstanceId();
  return {
    $meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: "configure",
    },
    database: {
      connectionString: "",
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

export async function configure(opts: {
  config?: string;
  section?: string;
}): Promise<void> {
  printSubstaffCliBanner();
  p.intro(pc.bgCyan(pc.black(" substaff configure ")));
  const configPath = resolveConfigPath(opts.config);

  if (!configExists(opts.config)) {
    p.log.error("No config file found. Run `substaff onboard` first.");
    p.outro("");
    return;
  }

  let config: SubstaffConfig;
  try {
    config = readConfig(opts.config) ?? defaultConfig();
  } catch (err) {
    p.log.message(
      pc.yellow(
        `Existing config is invalid. Loading defaults so you can repair it now.\n${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    config = defaultConfig();
  }

  let section: Section | undefined = opts.section as Section | undefined;

  if (section && !SECTION_LABELS[section]) {
    p.log.error(`Unknown section: ${section}. Choose from: ${Object.keys(SECTION_LABELS).join(", ")}`);
    p.outro("");
    return;
  }

  // Section selection loop
  let continueLoop = true;
  while (continueLoop) {
    if (!section) {
      const choice = await p.select({
        message: "Which section do you want to configure?",
        options: Object.entries(SECTION_LABELS).map(([value, label]) => ({
          value: value as Section,
          label,
        })),
      });

      if (p.isCancel(choice)) {
        p.cancel("Configuration cancelled.");
        return;
      }

      section = choice;
    }

    p.log.step(pc.bold(SECTION_LABELS[section]));

    switch (section) {
      case "database":
        config.database = await promptDatabase(config.database);
        break;
      case "llm": {
        const llm = await promptLlm();
        if (llm) {
          config.llm = llm;
        } else {
          delete config.llm;
        }
        break;
      }
      case "logging":
        config.logging = await promptLogging();
        break;
      case "server":
        {
          const { server, auth } = await promptServer({
            currentServer: config.server,
            currentAuth: config.auth,
          });
          config.server = server;
          config.auth = auth;
        }
        break;
      case "storage":
        config.storage = await promptStorage(config.storage);
        break;
    }

    config.$meta!.updatedAt = new Date().toISOString();
    config.$meta!.source = "configure";

    writeConfig(config, opts.config);
    p.log.success(`${SECTION_LABELS[section]} configuration updated.`);

    // If section was provided via CLI flag, don't loop
    if (opts.section) {
      continueLoop = false;
    } else {
      const another = await p.confirm({
        message: "Configure another section?",
        initialValue: false,
      });

      if (p.isCancel(another) || !another) {
        continueLoop = false;
      } else {
        section = undefined; // Reset to show picker again
      }
    }
  }

  p.outro("Configuration saved.");
}
