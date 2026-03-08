import type { ServerAdapterModule } from "./types.js";
import {
  execute as e2bExecute,
  testEnvironment as e2bTestEnvironment,
  sessionCodec as e2bSessionCodec,
  tryResumeOrphanedRun as e2bTryResumeOrphanedRun,
} from "@substaff/adapter-e2b-sandbox/server";
import { agentConfigurationDoc as e2bAgentConfigurationDoc, models as e2bModels } from "@substaff/adapter-e2b-sandbox";
import {
  execute as claudeLocalExecute,
  testEnvironment as claudeLocalTestEnvironment,
  sessionCodec as claudeLocalSessionCodec,
} from "@substaff/adapter-claude-local/server";
import { agentConfigurationDoc as claudeLocalAgentConfigurationDoc, models as claudeLocalModels } from "@substaff/adapter-claude-local";
import { processAdapter } from "./process/index.js";
import { httpAdapter } from "./http/index.js";

const e2bSandboxAdapter: ServerAdapterModule = {
  type: "e2b_sandbox",
  execute: e2bExecute,
  testEnvironment: e2bTestEnvironment,
  sessionCodec: e2bSessionCodec,
  models: e2bModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: e2bAgentConfigurationDoc,
  tryResumeOrphanedRun: e2bTryResumeOrphanedRun,
};

const claudeLocalAdapter: ServerAdapterModule = {
  type: "claude_local",
  execute: claudeLocalExecute,
  testEnvironment: claudeLocalTestEnvironment,
  sessionCodec: claudeLocalSessionCodec,
  models: claudeLocalModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: claudeLocalAgentConfigurationDoc,
};

const adaptersByType = new Map<string, ServerAdapterModule>(
  [e2bSandboxAdapter, claudeLocalAdapter, processAdapter, httpAdapter].map((a) => [a.type, a]),
);

export function getServerAdapter(type: string): ServerAdapterModule {
  const adapter = adaptersByType.get(type);
  if (!adapter) {
    return e2bSandboxAdapter;
  }
  return adapter;
}

export async function listAdapterModels(type: string): Promise<{ id: string; label: string }[]> {
  const adapter = adaptersByType.get(type);
  if (!adapter) return [];
  if (adapter.listModels) {
    const discovered = await adapter.listModels();
    if (discovered.length > 0) return discovered;
  }
  return adapter.models ?? [];
}

export function listServerAdapters(): ServerAdapterModule[] {
  return Array.from(adaptersByType.values());
}

export function findServerAdapter(type: string): ServerAdapterModule | null {
  return adaptersByType.get(type) ?? null;
}
