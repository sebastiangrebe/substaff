import type { CLIAdapterModule } from "@substaff/adapter-utils";
import { printBlaxelStreamEvent } from "@substaff/adapter-blaxel-sandbox/cli";
import { printE2BStreamEvent } from "@substaff/adapter-e2b-sandbox/cli";
import { processCLIAdapter } from "./process/index.js";
import { httpCLIAdapter } from "./http/index.js";

const blaxelSandboxCLIAdapter: CLIAdapterModule = {
  type: "blaxel_sandbox",
  formatStdoutEvent: printBlaxelStreamEvent,
};

const e2bSandboxCLIAdapter: CLIAdapterModule = {
  type: "e2b_sandbox",
  formatStdoutEvent: printE2BStreamEvent,
};

const adaptersByType = new Map<string, CLIAdapterModule>(
  [blaxelSandboxCLIAdapter, e2bSandboxCLIAdapter, processCLIAdapter, httpCLIAdapter].map((a) => [a.type, a]),
);

export function getCLIAdapter(type: string): CLIAdapterModule {
  return adaptersByType.get(type) ?? blaxelSandboxCLIAdapter;
}
