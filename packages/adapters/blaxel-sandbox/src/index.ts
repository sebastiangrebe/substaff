import type { AdapterModel } from "@substaff/adapter-utils";

export const agentConfigurationDoc = `
## Blaxel Sandbox Adapter

Executes agent tasks inside persistent Blaxel sandboxes. Sandboxes auto-suspend
when idle and resume in ~25ms with full memory/filesystem intact, eliminating
redundant setup on subsequent runs.

### Configuration

- **image** (string): Container image for the sandbox (default: "default")
- **memory** (number): Memory in MB (default: 1024)
- **timeoutSec** (number): Max execution time in seconds (default: 900, from DEFAULT_AGENT_TIMEOUT_SEC)
- **model** (string): LLM model to use inside the sandbox
`;

export const models: AdapterModel[] = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];
