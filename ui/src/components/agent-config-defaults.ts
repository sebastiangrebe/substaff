import type { CreateConfigValues } from "@substaff/adapter-utils";

export const defaultCreateValues: CreateConfigValues = {
  adapterType: "blaxel_sandbox",
  cwd: "",
  instructionsFilePath: "",
  promptTemplate: "",
  model: "",
  thinkingEffort: "",
  chrome: false,
  dangerouslySkipPermissions: false,
  search: false,
  dangerouslyBypassSandbox: false,
  command: "",
  args: "",
  extraArgs: "",
  envVars: "",
  envBindings: {},
  url: "",
  bootstrapPrompt: "",
  maxTurnsPerRun: 80,
  heartbeatEnabled: false,
  intervalSec: 300,
};
