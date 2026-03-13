import type { UIAdapterModule, CreateConfigValues } from "../types";
import type { TranscriptEntry } from "@substaff/adapter-utils";
import { BlaxelSandboxConfigFields } from "./config-fields";

function parseBlaxelStdoutLine(line: string, ts: string): TranscriptEntry[] {
  if (line === "[keepalive]") {
    return [];
  }
  if (line.startsWith("[blaxel]")) {
    return [{ kind: "system", ts, text: line }];
  }
  return [{ kind: "stdout", ts, text: line }];
}

function buildBlaxelConfig(values: CreateConfigValues): Record<string, unknown> {
  return {
    image: "substaff-claude",
    model: values.model || "claude-sonnet-4-6",
  };
}

export const blaxelSandboxUIAdapter: UIAdapterModule = {
  type: "blaxel_sandbox",
  label: "Blaxel Sandbox",
  parseStdoutLine: parseBlaxelStdoutLine,
  ConfigFields: BlaxelSandboxConfigFields,
  buildAdapterConfig: buildBlaxelConfig,
};
