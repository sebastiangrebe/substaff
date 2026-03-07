import type { UIAdapterModule } from "../types";
import { parseClaudeStdoutLine } from "@substaff/adapter-claude-local/ui";
import { ClaudeLocalConfigFields, ClaudeLocalAdvancedFields } from "./config-fields";
import { buildClaudeLocalConfig } from "@substaff/adapter-claude-local/ui";

export const claudeLocalUIAdapter: UIAdapterModule = {
  type: "claude_local",
  label: "Claude Code (local)",
  parseStdoutLine: parseClaudeStdoutLine,
  ConfigFields: ClaudeLocalConfigFields,
  buildAdapterConfig: buildClaudeLocalConfig,
};
