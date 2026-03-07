import type { AdapterModel } from "@substaff/adapter-utils";

export const agentConfigurationDoc = `
## E2B Sandbox Adapter

Executes agent tasks inside isolated E2B sandboxes. Each task gets its own
ephemeral sandbox with project files synced from object storage.

### Configuration

- **template** (string): E2B sandbox template ID (default: "base")
- **language** (string): Primary language runtime — "node", "python", etc.
- **timeoutSec** (number): Max execution time in seconds (default: 300)
- **model** (string): LLM model to use inside the sandbox
`;

export const models: AdapterModel[] = [
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4.1", label: "GPT-4.1" },
];
