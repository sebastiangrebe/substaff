import type { CLIAdapterModule } from "@substaff/adapter-utils";
import { printE2BStreamEvent } from "@substaff/adapter-e2b-sandbox/cli";
import { processCLIAdapter } from "./process/index.js";
import { httpCLIAdapter } from "./http/index.js";

const e2bSandboxCLIAdapter: CLIAdapterModule = {
  type: "e2b_sandbox",
  formatStdoutEvent: printE2BStreamEvent,
};

const adaptersByType = new Map<string, CLIAdapterModule>(
  [e2bSandboxCLIAdapter, processCLIAdapter, httpCLIAdapter].map((a) => [a.type, a]),
);

export function getCLIAdapter(type: string): CLIAdapterModule {
  return adaptersByType.get(type) ?? e2bSandboxCLIAdapter;
}
