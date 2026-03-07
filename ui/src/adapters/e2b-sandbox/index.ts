import type { UIAdapterModule, CreateConfigValues } from "../types";
import type { TranscriptEntry } from "@substaff/adapter-utils";
import { E2BSandboxConfigFields } from "./config-fields";

function parseE2BStdoutLine(line: string, ts: string): TranscriptEntry[] {
  if (line.startsWith("[e2b]")) {
    return [{ kind: "system", ts, text: line }];
  }
  return [{ kind: "stdout", ts, text: line }];
}

function buildE2BConfig(values: CreateConfigValues): Record<string, unknown> {
  return {
    template: "substaff-claude",
    model: values.model || "claude-sonnet-4-20250514",
    timeoutSec: 300,
  };
}

export const e2bSandboxUIAdapter: UIAdapterModule = {
  type: "e2b_sandbox",
  label: "E2B Sandbox",
  parseStdoutLine: parseE2BStdoutLine,
  ConfigFields: E2BSandboxConfigFields,
  buildAdapterConfig: buildE2BConfig,
};
