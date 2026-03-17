import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SandboxInstance } from "@blaxel/core";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterInvocationMeta,
  StorageServiceLike,
} from "@substaff/adapter-utils";
import {
  parseObject,
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  renderTemplate,
  redactEnvForLogs,
  buildSubstaffEnv,
  DEFAULT_AGENT_TIMEOUT_SEC,
} from "@substaff/adapter-utils/server-utils";
import {
  buildClaudeRuntimeConfig,
  type ClaudeExecutionInput,
} from "@substaff/adapter-claude-local/server";
import {
  parseClaudeStreamJson,
  describeClaudeFailure,
  detectClaudeLoginRequired,
  isClaudeMaxTurnsResult,
  formatTurnCostAnalysis,
} from "@substaff/adapter-claude-local/server";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SUBSTAFF_SKILLS_CANDIDATES = [
  path.resolve(__moduleDir, "../../skills"),         // published: <pkg>/dist/server/ -> <pkg>/skills/
  path.resolve(__moduleDir, "../../../../../skills"), // dev: src/server/ -> repo root/skills/
];

async function resolveSubstaffSkillsDir(): Promise<string | null> {
  for (const candidate of SUBSTAFF_SKILLS_CANDIDATES) {
    const isDir = await fs.stat(candidate).then((s) => s.isDirectory()).catch(() => false);
    if (isDir) return candidate;
  }
  return null;
}

const SUBSTAFF_COMPANIES_CANDIDATES = [
  path.resolve(__moduleDir, "../../companies"),         // published: <pkg>/dist/server/ -> <pkg>/companies/
  path.resolve(__moduleDir, "../../../../../companies"), // dev: src/server/ -> repo root/companies/
];

async function resolveCompaniesDir(): Promise<string | null> {
  for (const candidate of SUBSTAFF_COMPANIES_CANDIDATES) {
    const isDir = await fs.stat(candidate).then((s) => s.isDirectory()).catch(() => false);
    if (isDir) return candidate;
  }
  return null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Shell-safe quoting for environment variable values. */
function shellQuote(s: string): string {
  // Use $'...' syntax to handle all special characters safely
  return "$'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
}

/**
 * Build a deterministic, DNS-safe sandbox name from company + agent IDs.
 * Format: ss-{companyId[0:12]}-{agentId[0:12]}  (29 chars max)
 */
function buildSandboxName(companyId: string, agentId: string): string {
  return `ss-${companyId.slice(0, 12)}-${agentId.slice(0, 12)}`;
}

/**
 * Blaxel sandbox adapter — runs Claude Code CLI inside a persistent Blaxel sandbox.
 *
 * Unlike E2B (ephemeral), Blaxel sandboxes auto-suspend when idle and resume
 * in ~25ms with filesystem intact, eliminating redundant setup on subsequent runs.
 *
 * Uses claude-local's config/env/arg building logic, but executes via
 * sandbox.process.exec() instead of a local child process.
 */
export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);
  const image = asString(config.image, "substaff-claude");
  const memory = asNumber(config.memory, 0) || 1024;
  const timeoutSec = asNumber(config.timeoutSec, 0) || DEFAULT_AGENT_TIMEOUT_SEC;

  // Use claude-local's config builder to get env, args, prompt template, etc.
  const claudeInput: ClaudeExecutionInput = {
    runId: ctx.runId,
    agent: ctx.agent,
    config: ctx.config,
    context: ctx.context,
    authToken: ctx.authToken,
  };

  let runtimeConfig;
  try {
    runtimeConfig = await buildClaudeRuntimeConfig(claudeInput);
  } catch {
    runtimeConfig = null;
  }

  const model = asString(config.model, "");
  const maxTurns = asNumber(config.maxTurnsPerRun, 0);
  const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, true);
  const effort = asString(config.effort, "");
  const extraArgs = runtimeConfig?.extraArgs ?? asStringArray(config.extraArgs);
  const customPromptTemplate = asString(config.promptTemplate, "");

  // Build a preview env for meta
  const previewEnv = runtimeConfig?.env ?? buildSubstaffEnv(ctx.agent);
  const meta: AdapterInvocationMeta = {
    adapterType: "blaxel_sandbox",
    command: "claude",
    commandArgs: [image],
    env: redactEnvForLogs(previewEnv),
  };

  if (ctx.onMeta) {
    await ctx.onMeta(meta);
  }

  const sandboxName = buildSandboxName(ctx.agent.companyId, ctx.agent.id);
  let sandbox: SandboxInstance | null = null;

  try {
    await ctx.onLog("stdout", `[blaxel] Creating or resuming sandbox: ${sandboxName}\n`);

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        sandbox = await SandboxInstance.createIfNotExists({
          name: sandboxName,
          image,
          memory,
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is502 = msg.includes("502") || msg.includes("Bad Gateway");
        if (is502 && attempt < maxRetries) {
          const delaySec = attempt * 2;
          await ctx.onLog("stderr", `[blaxel] Got 502 creating sandbox (attempt ${attempt}/${maxRetries}), retrying in ${delaySec}s...\n`);
          await new Promise((r) => setTimeout(r, delaySec * 1000));
        } else {
          throw err;
        }
      }
    }

    if (!sandbox) {
      throw new Error(`[blaxel] Failed to create sandbox after retries: ${sandboxName}`);
    }

    await ctx.onLog("stdout", `[blaxel] Sandbox ready: ${sandboxName}\n`);

    // Persist sandbox name so the server can reconnect after a restart
    if (ctx.onExternalRunId) {
      await ctx.onExternalRunId(sandboxName);
    }

    // Build sandbox environment from claude-local's env builder + overrides
    const sandboxEnv: Record<string, string> = {};

    if (runtimeConfig) {
      Object.assign(sandboxEnv, runtimeConfig.env);
    } else {
      Object.assign(sandboxEnv, buildSubstaffEnv(ctx.agent));
      sandboxEnv.SUBSTAFF_RUN_ID = ctx.runId;
      const wakeTaskId = readNonEmptyString(ctx.context.taskId) ?? readNonEmptyString(ctx.context.issueId);
      const wakeReason = readNonEmptyString(ctx.context.wakeReason);
      const wakeCommentId = readNonEmptyString(ctx.context.wakeCommentId) ?? readNonEmptyString(ctx.context.commentId);
      const approvalId = readNonEmptyString(ctx.context.approvalId);
      const approvalStatus = readNonEmptyString(ctx.context.approvalStatus);
      if (wakeTaskId) sandboxEnv.SUBSTAFF_TASK_ID = wakeTaskId;
      if (wakeReason) sandboxEnv.SUBSTAFF_WAKE_REASON = wakeReason;
      if (wakeCommentId) sandboxEnv.SUBSTAFF_WAKE_COMMENT_ID = wakeCommentId;
      if (approvalId) sandboxEnv.SUBSTAFF_APPROVAL_ID = approvalId;
      if (approvalStatus) sandboxEnv.SUBSTAFF_APPROVAL_STATUS = approvalStatus;
      if (ctx.context.strategyReview === true || ctx.context.strategyReview === "true") {
        sandboxEnv.SUBSTAFF_STRATEGY_REVIEW = "true";
      }
      const envConfig = parseObject(config.env);
      for (const [key, value] of Object.entries(envConfig)) {
        if (typeof value === "string") sandboxEnv[key] = value;
      }
      if (ctx.authToken && !sandboxEnv.SUBSTAFF_API_KEY) {
        sandboxEnv.SUBSTAFF_API_KEY = ctx.authToken;
      }
    }

    if (sandboxEnv.SUBSTAFF_API_URL) {
      await ctx.onLog("stdout", `[blaxel] API URL for agent: ${sandboxEnv.SUBSTAFF_API_URL}\n`);
    }

    // Ensure ANTHROPIC_API_KEY is set.
    if (!sandboxEnv.ANTHROPIC_API_KEY) {
      const envConfig = parseObject(config.env);
      const key =
        ctx.llmApiKey ||
        asString(envConfig.ANTHROPIC_API_KEY, "") ||
        process.env.ANTHROPIC_API_KEY ||
        "";
      if (key) {
        sandboxEnv.ANTHROPIC_API_KEY = key;
      } else {
        await ctx.onLog("stderr", `[blaxel] Warning: No ANTHROPIC_API_KEY available. Claude Code will not work.\n`);
      }
    }

    const sandboxWorkDir = "/home/user/workspace";
    const sandboxSkillsDir = "/home/user/.skills";
    const storageNamespace = "workspace";

    await sandbox.fs.mkdir(sandboxWorkDir);

    // --- Setup optimization: skip steps if already done on this persistent sandbox ---

    // Upload skills (check marker file to skip if already uploaded)
    let skillsUploaded = false;
    let substaffSkillContent: string | null = null;
    const localSkillsDir = await resolveSubstaffSkillsDir();
    if (localSkillsDir) {
      try {
        // Compute a content hash for skills versioning
        const entries = await fs.readdir(localSkillsDir, { withFileTypes: true });
        const skillDirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
        const skillsVersion = skillDirNames.join(",");

        // Check if skills are already up-to-date
        let existingVersion = "";
        try {
          existingVersion = await sandbox.fs.read("/home/user/.skills/.skills-version");
        } catch {
          // Marker file doesn't exist yet
        }

        // Always read substaff skill content for system prompt injection
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name === "substaff") {
            const skillFiles = await fs.readdir(path.join(localSkillsDir, entry.name));
            if (skillFiles.includes("SKILL.md")) {
              substaffSkillContent = await fs.readFile(
                path.join(localSkillsDir, entry.name, "SKILL.md"),
                "utf-8",
              );
            }
          }
        }

        if (existingVersion === skillsVersion) {
          skillsUploaded = true;
          await ctx.onLog("stdout", `[blaxel] Skills already up-to-date, skipping upload\n`);
        } else {
          await ctx.onLog("stdout", `[blaxel] Uploading skills to sandbox...\n`);
          const targetSkillsPath = `${sandboxSkillsDir}/.claude/skills`;
          await sandbox.fs.mkdir(targetSkillsPath);
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            // Skip the substaff skill — it's already injected into the system prompt.
            // Uploading it here would make it available as an invocable /substaff command,
            // causing agents to waste ~5K tokens re-invoking it.
            if (entry.name === "substaff") continue;
            const skillDir = path.join(localSkillsDir, entry.name);
            const skillFiles = await fs.readdir(skillDir);
            await sandbox.fs.mkdir(`${targetSkillsPath}/${entry.name}`);
            for (const file of skillFiles) {
              const filePath = path.join(skillDir, file);
              const stat = await fs.stat(filePath);
              if (!stat.isFile()) continue;
              const content = await fs.readFile(filePath, "utf-8");
              await sandbox.fs.write(`${targetSkillsPath}/${entry.name}/${file}`, content);
            }
            // Also copy references/ subdirectory if present
            const refsDir = path.join(skillDir, "references");
            const hasRefs = await fs.stat(refsDir).then((s) => s.isDirectory()).catch(() => false);
            if (hasRefs) {
              await sandbox.fs.mkdir(`${targetSkillsPath}/${entry.name}/references`);
              const refFiles = await fs.readdir(refsDir);
              for (const file of refFiles) {
                const filePath = path.join(refsDir, file);
                const stat = await fs.stat(filePath);
                if (!stat.isFile()) continue;
                const content = await fs.readFile(filePath, "utf-8");
                await sandbox.fs.write(`${targetSkillsPath}/${entry.name}/references/${file}`, content);
              }
            }
          }
          // Write version marker
          await sandbox.fs.write("/home/user/.skills/.skills-version", skillsVersion);
          skillsUploaded = true;
          await ctx.onLog("stdout", `[blaxel] Skills uploaded to sandbox\n`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[blaxel] Warning: Failed to upload skills: ${msg}\n`);
      }
    }

    // Upload company template files (agent persona files) — always upload (may change via hiring)
    const personaContents: Record<string, string> = {};
    const agentRole = (ctx.agent as unknown as Record<string, unknown>).role;
    const role = typeof agentRole === "string" && agentRole ? agentRole : "ceo";
    const targetDir = `${sandboxWorkDir}/agents/${role}`;
    let personaFound = false;

    // Source 1: storage-based persona files (written by hiring agent, company-scoped)
    if (ctx.storageService) {
      try {
        const personaPrefix = `${storageNamespace}/agents/${role}/`;
        const listing = await ctx.storageService.listObjects(ctx.agent.companyId, personaPrefix);
        if (listing.objects.length > 0) {
          await sandbox.fs.mkdir(targetDir);
          for (const obj of listing.objects) {
            const fileName = obj.key.split("/").pop();
            if (!fileName || !fileName.endsWith(".md")) continue;
            const fileObj = await ctx.storageService.getObject(ctx.agent.companyId, obj.key);
            let content = "";
            for await (const chunk of fileObj.stream) {
              content += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
            }
            if (!content.trim()) continue;
            await sandbox.fs.write(`${targetDir}/${fileName}`, content);
            personaContents[fileName] = content;
          }
          personaFound = Object.keys(personaContents).length > 0;
          if (personaFound) {
            await ctx.onLog("stdout", `[blaxel] Agent persona files loaded from storage (${role})\n`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[blaxel] Warning: Failed to load persona files from storage: ${msg}\n`);
      }
    }

    // Source 2: repo-local templates (fallback)
    if (!personaFound) {
      const companiesDir = await resolveCompaniesDir();
      if (companiesDir) {
        try {
          const roleDir = path.join(companiesDir, "default", role);
          const roleDirExists = await fs.stat(roleDir).then((s) => s.isDirectory()).catch(() => false);
          if (roleDirExists) {
            await sandbox.fs.mkdir(targetDir);
            const files = await fs.readdir(roleDir);
            for (const file of files) {
              const filePath = path.join(roleDir, file);
              const stat = await fs.stat(filePath);
              if (!stat.isFile()) continue;
              const content = await fs.readFile(filePath, "utf-8");
              await sandbox.fs.write(`${targetDir}/${file}`, content);
              personaContents[file] = content;
            }
            personaFound = Object.keys(personaContents).length > 0;
            if (personaFound) {
              await ctx.onLog("stdout", `[blaxel] Agent persona files uploaded from templates (${role})\n`);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await ctx.onLog("stderr", `[blaxel] Warning: Failed to upload company templates: ${msg}\n`);
        }
      }
    }

    // Load agent instructions file if configured
    const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
    let sandboxInstructionsPath: string | null = null;
    if (instructionsFilePath) {
      let instructionsContent: string | null = null;

      // 1. Try reading from sandbox (may already exist from a previous run)
      try {
        instructionsContent = await sandbox.fs.read(instructionsFilePath);
      } catch {
        // Not in sandbox yet
      }

      // 2. Fall back to fetching from storage
      if (!instructionsContent && ctx.storageService && instructionsFilePath.startsWith(sandboxWorkDir + "/")) {
        try {
          const relativePath = instructionsFilePath.slice(sandboxWorkDir.length + 1);
          const objectKey = `${ctx.agent.companyId}/${storageNamespace}/${relativePath}`;
          await pullSingleFileFromStorage(
            sandbox, ctx.storageService, ctx.agent.companyId,
            objectKey, instructionsFilePath,
          );
          instructionsContent = await sandbox.fs.read(instructionsFilePath);
          await ctx.onLog("stdout", `[blaxel] Agent instructions fetched from storage\n`);
        } catch {
          // Not in storage either
        }
      }

      if (instructionsContent) {
        try {
          const instructionsFileDir = `${path.posix.dirname(instructionsFilePath)}/`;
          const pathDirective = `\nThe above agent instructions were loaded from ${instructionsFilePath}. Resolve any relative file references from ${instructionsFileDir}.`;
          sandboxInstructionsPath = "/home/user/agent-instructions.md";
          await sandbox.fs.write(sandboxInstructionsPath, instructionsContent + pathDirective);
          await ctx.onLog("stdout", `[blaxel] Agent instructions loaded\n`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await ctx.onLog("stderr", `[blaxel] Warning: Failed to write agent instructions: ${msg}\n`);
          sandboxInstructionsPath = null;
        }
      } else {
        await ctx.onLog("stderr", `[blaxel] Warning: Agent instructions file not found: ${instructionsFilePath}\n`);
      }
    }

    // Install Claude Code CLI (skip if already present — persistent sandbox keeps it)
    let claudeAlreadyInstalled = false;
    try {
      const markerContent = await sandbox.fs.read("/home/user/.claude-installed");
      claudeAlreadyInstalled = markerContent.trim() === "1";
    } catch {
      // Marker doesn't exist
    }

    if (claudeAlreadyInstalled) {
      await ctx.onLog("stdout", `[blaxel] Claude Code CLI already installed (persistent sandbox)\n`);
    } else {
      await ctx.onLog("stdout", `[blaxel] Installing Claude Code CLI...\n`);
      const installResult = await sandbox.process.exec({
        command: "npm install -g @anthropic-ai/claude-code 2>&1",
        env: sandboxEnv,
        waitForCompletion: true,
        timeout: 120,
      });
      if (installResult.exitCode !== 0) {
        await ctx.onLog("stderr", `[blaxel] Claude Code install failed: ${installResult.stdout}\n`);
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorMessage: `Failed to install Claude Code CLI: ${installResult.stdout}`,
          errorCode: "BLAXEL_INSTALL_ERROR",
        };
      }
      // Write marker so subsequent runs skip install
      await sandbox.fs.write("/home/user/.claude-installed", "1");
      await ctx.onLog("stdout", `[blaxel] Claude Code CLI installed\n`);
    }

    // Build Claude CLI args
    const claudeArgs = ["--print", "-", "--output-format", "stream-json", "--verbose"];
    if (dangerouslySkipPermissions) claudeArgs.push("--dangerously-skip-permissions");
    if (model) claudeArgs.push("--model", model);
    if (effort) claudeArgs.push("--effort", effort);
    if (maxTurns > 0) claudeArgs.push("--max-turns", String(maxTurns));
    // Build a single combined system prompt file
    {
      const systemPromptParts: string[] = [];
      if (sandboxInstructionsPath) {
        const instructionsContent = await sandbox.fs.read(sandboxInstructionsPath);
        systemPromptParts.push(instructionsContent);
      }
      if (substaffSkillContent) {
        const stripped = substaffSkillContent.replace(/^---[\s\S]*?---\s*/, "");
        systemPromptParts.push("\n\n--- SUBSTAFF HEARTBEAT SKILL (pre-loaded, do NOT invoke /substaff) ---\n" + stripped + "\n--- END SUBSTAFF HEARTBEAT SKILL ---");
      }
      if (systemPromptParts.length > 0) {
        const combinedPath = "/home/user/.substaff-system-prompt.md";
        await sandbox.fs.write(combinedPath, systemPromptParts.join("\n"));
        claudeArgs.push("--append-system-prompt-file", combinedPath);
      }
    }
    if (skillsUploaded) claudeArgs.push("--add-dir", sandboxSkillsDir);
    if (extraArgs.length > 0) claudeArgs.push(...extraArgs);

    // Write MCP config if integrations are configured (Composio URL-based servers)
    if (ctx.mcpConfig) {
      const mcpServers = (ctx.mcpConfig as { mcpServers?: Record<string, unknown> }).mcpServers;
      if (mcpServers && Object.keys(mcpServers).length > 0) {
        const mcpConfigPath = "/home/user/.mcp-config.json";
        await sandbox.fs.write(mcpConfigPath, JSON.stringify({ mcpServers }, null, 2));
        claudeArgs.push("--mcp-config", mcpConfigPath);

        await ctx.onLog("stdout", `[blaxel] MCP config written with servers: ${Object.keys(mcpServers).join(", ")}\n`);
      }
    }

    // Build prompt
    const defaultPrompt = buildDefaultPrompt(ctx.context, ctx.agent, personaContents);
    const promptTemplate = customPromptTemplate || defaultPrompt;
    const prompt = renderTemplate(promptTemplate, {
      agentId: ctx.agent.id,
      companyId: ctx.agent.companyId,
      runId: ctx.runId,
      company: { id: ctx.agent.companyId },
      agent: ctx.agent,
      run: { id: ctx.runId, source: "on_demand" },
      context: ctx.context,
      context_json: JSON.stringify(ctx.context, null, 2),
    });

    // Write prompt to a file, then pipe it to claude via stdin
    const promptPath = "/home/user/.substaff-prompt.txt";
    await sandbox.fs.write(promptPath, prompt);

    // Build a wrapper script so we can run as non-root user.
    // Claude Code refuses --dangerously-skip-permissions under root/sudo.
    const scriptLines = ["#!/bin/bash", "set -e"];
    for (const [k, v] of Object.entries(sandboxEnv)) {
      // Use heredoc-style quoting to safely handle any value
      scriptLines.push(`export ${k}=${shellQuote(v)}`);
    }
    scriptLines.push(`export DISABLE_AUTOUPDATER=1`);
    scriptLines.push(`cd ${sandboxWorkDir}`);
    scriptLines.push(`cat ${promptPath} | claude ${claudeArgs.join(" ")}`);
    const wrapperPath = "/home/user/.substaff-run.sh";
    await sandbox.fs.write(wrapperPath, scriptLines.join("\n") + "\n");

    // Ensure /home/user is owned by 'user' so Claude Code can write config/cache
    await sandbox.process.exec({
      command: "chown -R user:user /home/user",
      waitForCompletion: true,
      timeout: 30,
    });

    // Run as 'user' to avoid root restrictions
    const claudeCommand = `su -s /bin/bash user ${wrapperPath}`;

    await ctx.onLog("stdout", `[blaxel] Running Claude Code in sandbox...\n`);

    const execTimeoutSec = timeoutSec - 60; // leave 60s buffer

    // Execute with streaming callbacks for real-time logs
    let stdout = "";
    let stderr = "";
    const execution = await sandbox.process.exec({
      command: claudeCommand,
      waitForCompletion: true,
      timeout: execTimeoutSec,
      onStdout: (data) => {
        stdout += data;
        void ctx.onLog("stdout", data);
      },
      onStderr: (data) => {
        stderr += data;
        void ctx.onLog("stderr", data);
      },
    });

    // Parse Claude's stream-json output
    const parsed = parseClaudeStreamJson(stdout);
    const loginMeta = detectClaudeLoginRequired({ parsed: parsed.resultJson, stdout, stderr });

    // Push workspace files back to S3
    if (ctx.storageService) {
      await ctx.onLog("stdout", `[blaxel] Pushing workspace files to storage...\n`);
      try {
        const uploadedCount = await pushFilesToStorage(
          sandbox, ctx.storageService, ctx.agent.companyId,
          sandboxWorkDir, storageNamespace, ctx.onLog,
        );
        await ctx.onLog("stdout", `[blaxel] Pushed ${uploadedCount} files to storage\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[blaxel] Warning: Failed to push files to storage: ${msg}\n`);
      }
    }

    const timedOut = execution.exitCode === 124;
    if (timedOut) {
      return {
        exitCode: execution.exitCode,
        signal: null,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        errorCode: "timeout",
      };
    }

    if (!parsed.resultJson) {
      const stderrLines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const stderrExcerpt = stderrLines.slice(0, 5).join("; ");

      if ((execution.exitCode ?? 0) !== 0) {
        await ctx.onLog("stderr", `[blaxel] Claude exited with code ${execution.exitCode}. stderr: ${stderr || "(empty)"}\n`);
        if (stdout) {
          await ctx.onLog("stderr", `[blaxel] stdout (first 2000 chars): ${stdout.slice(0, 2000)}\n`);
        }
      }

      return {
        exitCode: execution.exitCode,
        signal: null,
        timedOut: false,
        errorMessage:
          (execution.exitCode ?? 0) !== 0
            ? stderrExcerpt
              ? `Claude exited with code ${execution.exitCode ?? -1}: ${stderrExcerpt}`
              : `Claude exited with code ${execution.exitCode ?? -1}`
            : "Failed to parse claude JSON output",
        errorCode: loginMeta.requiresLogin ? "claude_auth_required" : null,
        resultJson: { stdout, stderr },
      };
    }

    const billingType = sandboxEnv.ANTHROPIC_API_KEY ? "api" : "subscription";
    const clearSessionForMaxTurns = isClaudeMaxTurnsResult(parsed.resultJson);

    await ctx.onLog("stdout", `[blaxel] Execution complete. Exit code: ${execution.exitCode}\n`);

    // Log per-turn cost analysis (opt-in via SUBSTAFF_DEBUG_COST=1)
    if (process.env.SUBSTAFF_DEBUG_COST === "1") {
      const costLines = formatTurnCostAnalysis(parsed.turnUsages, "[blaxel]");
      if (costLines.length > 0) {
        await ctx.onLog("stdout", costLines.join("\n") + "\n");
      }
    }

    // NOTE: Sandbox is NOT killed — it auto-suspends when idle
    return {
      exitCode: execution.exitCode,
      signal: null,
      timedOut: false,
      errorMessage:
        (execution.exitCode ?? 0) === 0
          ? null
          : describeClaudeFailure(parsed.resultJson) ?? `Claude exited with code ${execution.exitCode ?? -1}`,
      errorCode: loginMeta.requiresLogin ? "claude_auth_required" : null,
      usage: parsed.usage ?? undefined,
      sessionId: parsed.sessionId,
      sessionParams: parsed.sessionId
        ? ({ sessionId: parsed.sessionId, sandboxName, cwd: sandboxWorkDir } as Record<string, unknown>)
        : null,
      sessionDisplayId: parsed.sessionId,
      provider: "anthropic",
      model: parsed.model || model,
      billingType,
      costUsd: parsed.costUsd ?? undefined,
      resultJson: parsed.resultJson,
      summary: parsed.summary,
      clearSession: clearSessionForMaxTurns,
    };
  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null
        ? JSON.stringify(err, null, 2)
        : String(err);
    await ctx.onLog("stderr", `[blaxel] Error: ${message}\n`);

    const errRecord = err as Record<string, unknown> | null;
    const errStdout = typeof errRecord?.stdout === "string" ? errRecord.stdout : "";
    const errStderr = typeof errRecord?.stderr === "string" ? errRecord.stderr : "";
    const errExitCode = typeof errRecord?.exitCode === "number" ? errRecord.exitCode : 1;

    if (errStdout) {
      await ctx.onLog("stdout", `[blaxel] Captured stdout:\n${errStdout}\n`);
    }
    if (errStderr) {
      await ctx.onLog("stderr", `[blaxel] Captured stderr:\n${errStderr}\n`);
    }

    if (err instanceof Error && err.stack) {
      await ctx.onLog("stderr", `[blaxel] Stack: ${err.stack}\n`);
    }

    // Best-effort: push any files the agent created before the error
    if (sandbox && ctx.storageService) {
      try {
        const storageNs = "workspace";
        await pushFilesToStorage(sandbox, ctx.storageService, ctx.agent.companyId, "/home/user/workspace", storageNs, ctx.onLog);
      } catch {
        // Ignore — sandbox may already be dead
      }
    }

    // NOTE: No sandbox.kill() — Blaxel sandboxes auto-suspend
    return {
      exitCode: errExitCode,
      signal: null,
      timedOut: message.includes("timeout"),
      errorMessage: errStderr ? `${message}: ${errStderr.split("\n").filter(Boolean).slice(0, 3).join("; ")}` : message,
      errorCode: "BLAXEL_EXECUTION_ERROR",
      resultJson: errStdout || errStderr ? { stdout: errStdout, stderr: errStderr } : undefined,
    };
  }
  // NOTE: No finally { sandbox.kill() } — Blaxel sandboxes auto-suspend when idle
}

/**
 * Guess MIME type from file extension using the `mime-types` package.
 */
const _require = createRequire(import.meta.url);

let _mimeLookup: ((path: string) => string | false) | undefined;

function guessContentType(filename: string): string {
  if (_mimeLookup === undefined) {
    try {
      const mod = _require("mime-types") as { lookup: (p: string) => string | false };
      _mimeLookup = mod.lookup;
    } catch {
      _mimeLookup = () => false;
    }
  }
  return _mimeLookup(filename) || "application/octet-stream";
}

/** Fetch a single file from storage and write it into the sandbox. */
async function pullSingleFileFromStorage(
  sandbox: SandboxInstance,
  storage: StorageServiceLike,
  companyId: string,
  objectKey: string,
  targetPath: string,
): Promise<boolean> {
  const result = await storage.getObject(companyId, objectKey);
  const chunks: string[] = [];
  for await (const chunk of result.stream) {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
  }
  const content = chunks.join("");
  if (!content) return false;

  const targetDir = path.posix.dirname(targetPath);
  await sandbox.fs.mkdir(targetDir);
  await sandbox.fs.write(targetPath, content);
  return true;
}

/** Push workspace files from the sandbox back to S3 storage. */
export async function pushFilesToStorage(
  sandbox: SandboxInstance,
  storage: StorageServiceLike,
  companyId: string,
  workDir: string,
  namespace: string,
  onLog: AdapterExecutionContext["onLog"],
): Promise<number> {
  // Use Blaxel's fs.find() instead of shell find command
  const findResult = await sandbox.fs.find(workDir, {
    type: "file",
    excludeDirs: ["node_modules", ".git", ".claude"],
  });

  const files = findResult.matches
    .map((m) => m.path)
    .filter((p) => !p.endsWith(".substaff-prompt.txt"));

  if (files.length === 0) return 0;

  let uploaded = 0;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit per file

  for (const absolutePath of files) {
    try {
      const blob = await sandbox.fs.readBinary(absolutePath);
      const body = Buffer.from(await blob.arrayBuffer());

      if (body.length === 0 || body.length > MAX_FILE_SIZE) continue;

      const relativePath = absolutePath.startsWith(workDir)
        ? absolutePath.slice(workDir.length).replace(/^\//, "")
        : path.posix.basename(absolutePath);

      await storage.putFileExact({
        companyId,
        namespace,
        originalFilename: relativePath,
        contentType: guessContentType(relativePath),
        body,
      });

      uploaded++;
    } catch {
      // Skip files that fail to read/upload
    }
  }

  return uploaded;
}

function buildDefaultPrompt(
  context: Record<string, unknown>,
  agent: { id: string; name?: string | null },
  personaContents?: Record<string, string>,
): string {
  const parts = [
    `You are agent ${agent.id}${agent.name ? ` (${agent.name})` : ""}. Continue your Substaff work.`,
  ];
  const title = typeof context.issueTitle === "string" && context.issueTitle ? context.issueTitle : null;
  const identifier = typeof context.issueIdentifier === "string" ? context.issueIdentifier : null;
  const description = typeof context.issueDescription === "string" && context.issueDescription ? context.issueDescription : null;
  const status = typeof context.issueStatus === "string" && context.issueStatus ? context.issueStatus : null;
  if (title) {
    parts.push(`\n\nYour current task${identifier ? ` (${identifier})` : ""}: ${title}`);
    if (description) parts.push(`\nDescription: ${description}`);
    if (status) parts.push(`\nStatus: ${status}`);
  }
  const projectState = typeof context.projectState === "string" && context.projectState ? context.projectState : null;
  if (projectState) {
    parts.push("\n\n--- PROJECT STATE (shared context across all agents) ---");
    parts.push(`\n${projectState.trim()}`);
    parts.push("\n--- END PROJECT STATE ---");
  }

  // Inject pre-loaded rejected plan so agent can revise without API calls
  const rejectedPlan = context.rejectedPlan as { planMarkdown?: string; reviewerComments?: unknown } | undefined;
  if (rejectedPlan?.planMarkdown) {
    parts.push("\n\n--- REJECTED PLAN (revise based on reviewer feedback) ---");
    const comments = Array.isArray(rejectedPlan.reviewerComments) ? rejectedPlan.reviewerComments : [];
    if (comments.length > 0) {
      parts.push("\nReviewer feedback:");
      for (const c of comments) {
        const comment = typeof c === "object" && c !== null ? (c as Record<string, unknown>).comment : c;
        if (comment) parts.push(`- ${comment}`);
      }
    }
    parts.push(`\nPrevious plan:\n${rejectedPlan.planMarkdown.trim()}`);
    parts.push("\n--- END REJECTED PLAN ---");
  }

  // Inject pre-loaded comments so agent can skip GET /comments (saves 1 turn)
  const recentComments = Array.isArray(context.recentComments) ? context.recentComments : [];
  if (recentComments.length > 0) {
    parts.push("\n\n--- RECENT COMMENTS (pre-loaded, skip GET /comments) ---");
    for (const c of recentComments as Array<Record<string, unknown>>) {
      const author = c.authorAgentId ? `agent:${c.authorAgentId}` : c.authorUserId ? `user:${c.authorUserId}` : "unknown";
      parts.push(`\n[${author} @ ${c.createdAt}] ${c.body}`);
    }
    parts.push("\n--- END RECENT COMMENTS ---");
  }

  parts.push("\n\nYou are running inside a Blaxel sandbox. Your workspace is /home/user/workspace.");
  parts.push("This sandbox is persistent — your files and installed tools are preserved between runs.");
  parts.push("Agent persona files have been pre-loaded into agents/<role>/ in your workspace. Do NOT try to download them from GitHub.");

  if (personaContents && Object.keys(personaContents).length > 0) {
    parts.push("\n\n--- AGENT PERSONA (pre-loaded, no need to read these files) ---");
    const orderedFiles = ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"];
    for (const file of orderedFiles) {
      if (personaContents[file]) {
        parts.push(`\n\n### ${file}\n${personaContents[file].trim()}`);
      }
    }
    for (const [file, content] of Object.entries(personaContents)) {
      if (!orderedFiles.includes(file)) {
        parts.push(`\n\n### ${file}\n${content.trim()}`);
      }
    }
    parts.push("\n\n--- END AGENT PERSONA ---");
    parts.push("\n\nAll heartbeat instructions and persona are pre-loaded above. Start your heartbeat procedure immediately. Do NOT invoke /substaff (not available), re-read persona files, or search for files before checking assignments.");
  }

  return parts.join("");
}
