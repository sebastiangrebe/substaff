import type { SubstaffConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

// Secrets are no longer managed in the config file.
// This check is kept as a stub that always passes.
export function secretsCheck(_config: SubstaffConfig, _configPath?: string): CheckResult {
  return {
    name: "Secrets adapter",
    status: "pass",
    message: "Secrets management is handled externally",
  };
}
