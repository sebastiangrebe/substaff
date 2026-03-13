import type { Db } from "@substaff/db";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { agentService, llmKeyManagerService } from "../services/index.js";
import { assertBoard, companyRouter } from "./authz.js";
import { badRequest } from "../errors.js";
import { logger } from "../middleware/logger.js";

const CONTEXT_PROMPTS: Record<string, string> = {
  "org:prompt-to-org": `You are an organizational design assistant for Substaff.
You help users modify their company's org structure by proposing concrete changes quickly.

## Current Organization
{{ORG_STRUCTURE}}

## Your Role
- When the user describes what they want, IMMEDIATELY propose an org structure using the \`propose_org_changes\` tool. Do NOT ask more than one clarifying question before proposing.
- Bias toward action: make reasonable assumptions and propose a structure. The user can refine it afterward.
- If the request is truly unclear (e.g. just "help"), ask ONE short question, then propose on the next message.
- Never list multiple questions. Never ask about timeline, size preferences, or details the user didn't mention. Just propose something sensible.
- You can propose multiple changes across multiple tool calls.
- Keep responses short and direct. No bullet-point questionnaires.`,
};

function loadContextPrompt(contextKey: string): string | null {
  return CONTEXT_PROMPTS[contextKey] ?? null;
}

function buildToolsForContext(contextKey: string) {
  if (contextKey === "org:prompt-to-org") {
    return {
      propose_org_changes: tool({
        description:
          "Propose an organizational change. Creates a structured task for the CEO agent to execute. " +
          "Call this when you have enough information about the desired org changes.",
        inputSchema: z.object({
          title: z.string().describe("Short title for the org change task"),
          description: z
            .string()
            .describe("Detailed description of the org changes to make"),
          priority: z
            .enum(["urgent", "high", "medium", "low"])
            .default("medium")
            .describe("Priority level for the task"),
        }),
        execute: async ({ title, description, priority }) => {
          return {
            status: "proposed",
            title,
            description,
            priority,
            message: "Org change proposed. The user can review and create the task from the chat.",
          };
        },
      }),
    };
  }
  return undefined;
}

export function chatRoutes(db: Db) {
  const router = companyRouter();
  const agents = agentService(db);
  const llmKeys = llmKeyManagerService(db);

  router.post(
    "/companies/:companyId/chat",
    async (req, res) => {
      assertBoard(req);
      const { companyId } = req.params;

      const { messages, contextKey } = req.body;
      if (!contextKey || typeof contextKey !== "string") {
        throw badRequest("contextKey is required");
      }
      if (!Array.isArray(messages)) {
        throw badRequest("messages array is required");
      }

      // Load system prompt
      let systemPrompt = loadContextPrompt(contextKey);
      if (!systemPrompt) {
        throw badRequest(`Unknown context key: ${contextKey}`);
      }

      // Enrich system prompt based on context
      if (contextKey === "org:prompt-to-org") {
        try {
          const orgTree = await agents.orgForCompany(companyId);
          const orgSummary = formatOrgTree(orgTree);
          systemPrompt = systemPrompt.replace("{{ORG_STRUCTURE}}", orgSummary);
        } catch (err: unknown) {
          logger.warn({ err, companyId }, "Failed to fetch org tree for chat context");
          systemPrompt = systemPrompt.replace(
            "{{ORG_STRUCTURE}}",
            "Unable to load current organization structure.",
          );
        }
      }

      // Resolve LLM key
      let resolvedKey;
      try {
        resolvedKey = await llmKeys.resolveKey(companyId, "anthropic");
      } catch {
        res.status(422).json({ error: "LLM not configured. Set an Anthropic API key in company settings or configure MANAGED_ANTHROPIC_API_KEY." });
        return;
      }

      const anthropic = createAnthropic({ apiKey: resolvedKey.key });
      const tools = buildToolsForContext(contextKey);

      // Client sends UIMessage[] format (parts-based); convert to ModelMessage[] for streamText
      const modelMessages = await convertToModelMessages(messages);

      const result = streamText({
        model: anthropic("claude-sonnet-4-20250514"),
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(5),
      });

      result.pipeUIMessageStreamToResponse(res);
    },
  );

  return router;
}

function formatOrgTree(tree: Array<Record<string, unknown>>, indent = 0): string {
  if (!tree || tree.length === 0) {
    return "No agents configured yet.";
  }

  const lines: string[] = [];
  for (const node of tree) {
    const prefix = "  ".repeat(indent);
    const name = node.name as string;
    const role = node.role as string;
    const title = node.title as string | null;
    const status = node.status as string;
    lines.push(`${prefix}- ${name} (${title ?? role}, status: ${status})`);
    const reports = node.reports as Array<Record<string, unknown>> | undefined;
    if (reports && reports.length > 0) {
      lines.push(formatOrgTree(reports, indent + 1));
    }
  }
  return lines.join("\n");
}
