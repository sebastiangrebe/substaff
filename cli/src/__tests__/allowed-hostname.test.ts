import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SubstaffConfig } from "../config/schema.js";
import { addAllowedHostname } from "../commands/allowed-hostname.js";

function createTempConfigPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "substaff-allowed-hostname-"));
  return path.join(dir, "config.json");
}

function writeBaseConfig(configPath: string) {
  const base = {
    $meta: {
      version: 1,
      updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      source: "configure",
    },
    database: {
      connectionString: "postgres://substaff:substaff@127.0.0.1:54329/substaff",
    },
    logging: {
      mode: "file",
      logDir: "/tmp/substaff-logs",
    },
    server: {
      deploymentMode: "authenticated",
      host: "0.0.0.0",
      port: 3100,
      serveUi: true,
    },
    auth: {},
    storage: {
      s3: {
        bucket: "substaff",
        region: "us-east-1",
        prefix: "",
        forcePathStyle: false,
      },
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(base, null, 2));
}

describe("allowed-hostname command", () => {
  it("is a no-op since allowed hostnames are no longer managed", async () => {
    const configPath = createTempConfigPath();
    writeBaseConfig(configPath);

    // Command is a no-op now; just verify it does not throw.
    await addAllowedHostname("https://Dotta-MacBook-Pro:3100", { config: configPath });
    await addAllowedHostname("dotta-macbook-pro", { config: configPath });
  });
});
