import type { UsageSummary } from "@substaff/adapter-utils";
import { asString, asNumber, parseObject, parseJson } from "@substaff/adapter-utils/server-utils";

const CLAUDE_AUTH_REQUIRED_RE = /(?:not\s+logged\s+in|please\s+log\s+in|please\s+run\s+`?claude\s+login`?|login\s+required|requires\s+login|unauthorized|authentication\s+required)/i;
const URL_RE = /(https?:\/\/[^\s'"`<>()[\]{};,!?]+[^\s'"`<>()[\]{};,!.?:]+)/gi;

/** Per-turn usage snapshot emitted by Claude Code stream-json */
export interface TurnUsage {
  turn: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Tool names invoked this turn (from content blocks) */
  tools: string[];
  /** Total input context size this turn (input + cacheRead + cacheCreation) */
  contextTokens: number;
}

export function parseClaudeStreamJson(stdout: string) {
  let sessionId: string | null = null;
  let model = "";
  let finalResult: Record<string, unknown> | null = null;
  const assistantTexts: string[] = [];
  const turnUsages: TurnUsage[] = [];
  let turnCounter = 0;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const event = parseJson(line);
    if (!event) continue;

    const type = asString(event.type, "");
    if (type === "system" && asString(event.subtype, "") === "init") {
      sessionId = asString(event.session_id, sessionId ?? "") || sessionId;
      model = asString(event.model, model);
      continue;
    }

    if (type === "assistant") {
      turnCounter++;
      sessionId = asString(event.session_id, sessionId ?? "") || sessionId;
      const message = parseObject(event.message);
      const content = Array.isArray(message.content) ? message.content : [];
      const tools: string[] = [];
      for (const entry of content) {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
        const block = entry as Record<string, unknown>;
        if (asString(block.type, "") === "text") {
          const text = asString(block.text, "");
          if (text) assistantTexts.push(text);
        }
        if (asString(block.type, "") === "tool_use") {
          tools.push(asString(block.name, "unknown"));
        }
      }

      // Extract per-turn usage from assistant message
      const msgUsage = parseObject(message.usage);
      const inputTokens = asNumber(msgUsage.input_tokens, 0);
      const outputTokens = asNumber(msgUsage.output_tokens, 0);
      const cacheReadTokens = asNumber(msgUsage.cache_read_input_tokens, 0);
      const cacheObj = parseObject(msgUsage.cache_creation);
      const cacheCreationTokens =
        asNumber(cacheObj.ephemeral_5m_input_tokens, 0) +
        asNumber(cacheObj.ephemeral_1h_input_tokens, 0) +
        asNumber(msgUsage.cache_creation_input_tokens, 0);

      if (inputTokens > 0 || outputTokens > 0 || cacheReadTokens > 0) {
        turnUsages.push({
          turn: turnCounter,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          tools,
          contextTokens: inputTokens + cacheReadTokens + cacheCreationTokens,
        });
      }
      continue;
    }

    if (type === "result") {
      finalResult = event;
      sessionId = asString(event.session_id, sessionId ?? "") || sessionId;
    }
  }

  if (!finalResult) {
    return {
      sessionId,
      model,
      costUsd: null as number | null,
      usage: null as UsageSummary | null,
      summary: assistantTexts.join("\n\n").trim(),
      resultJson: null as Record<string, unknown> | null,
      turnUsages,
    };
  }

  const usageObj = parseObject(finalResult.usage);
  const usage: UsageSummary = {
    inputTokens: asNumber(usageObj.input_tokens, 0),
    cachedInputTokens: asNumber(usageObj.cache_read_input_tokens, 0),
    outputTokens: asNumber(usageObj.output_tokens, 0),
  };
  const costRaw = finalResult.total_cost_usd;
  const costUsd = typeof costRaw === "number" && Number.isFinite(costRaw) ? costRaw : null;
  const summary = asString(finalResult.result, assistantTexts.join("\n\n")).trim();

  return {
    sessionId,
    model,
    costUsd,
    usage,
    summary,
    resultJson: finalResult,
    turnUsages,
  };
}

function extractClaudeErrorMessages(parsed: Record<string, unknown>): string[] {
  const raw = Array.isArray(parsed.errors) ? parsed.errors : [];
  const messages: string[] = [];

  for (const entry of raw) {
    if (typeof entry === "string") {
      const msg = entry.trim();
      if (msg) messages.push(msg);
      continue;
    }

    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }

    const obj = entry as Record<string, unknown>;
    const msg = asString(obj.message, "") || asString(obj.error, "") || asString(obj.code, "");
    if (msg) {
      messages.push(msg);
      continue;
    }

    try {
      messages.push(JSON.stringify(obj));
    } catch {
      // skip non-serializable entry
    }
  }

  return messages;
}

export function extractClaudeLoginUrl(text: string): string | null {
  const match = text.match(URL_RE);
  if (!match || match.length === 0) return null;
  for (const rawUrl of match) {
    const cleaned = rawUrl.replace(/[\])}.!,?;:'\"]+$/g, "");
    if (cleaned.includes("claude") || cleaned.includes("anthropic") || cleaned.includes("auth")) {
      return cleaned;
    }
  }
  return match[0]?.replace(/[\])}.!,?;:'\"]+$/g, "") ?? null;
}

export function detectClaudeLoginRequired(input: {
  parsed: Record<string, unknown> | null;
  stdout: string;
  stderr: string;
}): { requiresLogin: boolean; loginUrl: string | null } {
  const resultText = asString(input.parsed?.result, "").trim();
  const messages = [resultText, ...extractClaudeErrorMessages(input.parsed ?? {}), input.stdout, input.stderr]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const requiresLogin = messages.some((line) => CLAUDE_AUTH_REQUIRED_RE.test(line));
  return {
    requiresLogin,
    loginUrl: extractClaudeLoginUrl([input.stdout, input.stderr].join("\n")),
  };
}

export function describeClaudeFailure(parsed: Record<string, unknown>): string | null {
  const subtype = asString(parsed.subtype, "");
  const resultText = asString(parsed.result, "").trim();
  const errors = extractClaudeErrorMessages(parsed);

  let detail = resultText;
  if (!detail && errors.length > 0) {
    detail = errors[0] ?? "";
  }

  const parts = ["Claude run failed"];
  if (subtype) parts.push(`subtype=${subtype}`);
  if (detail) parts.push(detail);
  return parts.length > 1 ? parts.join(": ") : null;
}

export function isClaudeMaxTurnsResult(parsed: Record<string, unknown> | null | undefined): boolean {
  if (!parsed) return false;

  const subtype = asString(parsed.subtype, "").trim().toLowerCase();
  if (subtype === "error_max_turns") return true;

  const stopReason = asString(parsed.stop_reason, "").trim().toLowerCase();
  if (stopReason === "max_turns") return true;

  const resultText = asString(parsed.result, "").trim();
  return /max(?:imum)?\s+turns?/i.test(resultText);
}

export function isClaudeUnknownSessionError(parsed: Record<string, unknown>): boolean {
  const resultText = asString(parsed.result, "").trim();
  const allMessages = [resultText, ...extractClaudeErrorMessages(parsed)]
    .map((msg) => msg.trim())
    .filter(Boolean);

  return allMessages.some((msg) =>
    /no conversation found with session id|unknown session|session .* not found/i.test(msg),
  );
}

/**
 * Format turn-by-turn cost analysis lines for logging.
 * Returns an array of pre-formatted lines (caller decides how to emit them).
 */
export function formatTurnCostAnalysis(turnUsages: TurnUsage[], prefix = "[claude]"): string[] {
  if (turnUsages.length === 0) return [];
  const lines = [`${prefix} === Turn-by-turn cost analysis ===`];
  let prevContext = 0;
  for (const t of turnUsages) {
    const contextGrowth = prevContext > 0 ? ` (+${((t.contextTokens - prevContext) / 1000).toFixed(1)}K)` : "";
    const toolStr = t.tools.length > 0 ? ` [${t.tools.join(", ")}]` : "";
    lines.push(
      `${prefix}   Turn ${String(t.turn).padStart(2)}: ` +
      `ctx=${(t.contextTokens / 1000).toFixed(1)}K${contextGrowth} ` +
      `out=${(t.outputTokens / 1000).toFixed(1)}K ` +
      `cache_create=${(t.cacheCreationTokens / 1000).toFixed(1)}K` +
      `${toolStr}`,
    );
    prevContext = t.contextTokens;
  }
  const totalCtx = turnUsages.reduce((s, t) => s + t.contextTokens, 0);
  const totalOut = turnUsages.reduce((s, t) => s + t.outputTokens, 0);
  const totalCacheCreate = turnUsages.reduce((s, t) => s + t.cacheCreationTokens, 0);
  const maxCtx = Math.max(...turnUsages.map((t) => t.contextTokens));
  lines.push(
    `${prefix} === Summary: ${turnUsages.length} turns, ` +
    `total_ctx=${(totalCtx / 1000).toFixed(0)}K, total_out=${(totalOut / 1000).toFixed(0)}K, ` +
    `total_cache_create=${(totalCacheCreate / 1000).toFixed(0)}K, ` +
    `max_ctx_per_turn=${(maxCtx / 1000).toFixed(1)}K ===`,
  );
  return lines;
}
