import type { UIAdapterModule } from "./types";
import { blaxelSandboxUIAdapter } from "./blaxel-sandbox";
import { e2bSandboxUIAdapter } from "./e2b-sandbox";
import { claudeLocalUIAdapter } from "./claude-local";
import { codexLocalUIAdapter } from "./codex-local";
import { cursorLocalUIAdapter } from "./cursor";
import { openClawUIAdapter } from "./openclaw";
import { openCodeLocalUIAdapter } from "./opencode-local";
import { processUIAdapter } from "./process";
import { httpUIAdapter } from "./http";

const adaptersByType = new Map<string, UIAdapterModule>(
  [blaxelSandboxUIAdapter, e2bSandboxUIAdapter, claudeLocalUIAdapter, codexLocalUIAdapter, cursorLocalUIAdapter, openClawUIAdapter, openCodeLocalUIAdapter, processUIAdapter, httpUIAdapter].map((a) => [a.type, a]),
);

export function getUIAdapter(type: string): UIAdapterModule {
  return adaptersByType.get(type) ?? blaxelSandboxUIAdapter;
}
