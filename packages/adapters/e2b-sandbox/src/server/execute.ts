import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox } from "e2b";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterInvocationMeta,
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

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * E2B sandbox adapter — runs Claude Code CLI inside an isolated E2B microVM.
 *
 * Uses claude-local's config/env/arg building logic, but executes via
 * sandbox.commands.run() instead of a local child process.
 */
export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);
  const template = asString(config.template, "base");
  const sandboxTimeoutSec = asNumber(config.sandboxTimeoutSec, 900);

  // Use claude-local's config builder to get env, args, prompt template, etc.
  const claudeInput: ClaudeExecutionInput = {
    runId: ctx.runId,
    agent: ctx.agent,
    config: ctx.config,
    context: ctx.context,
    authToken: ctx.authToken,
  };

  // Build the Claude runtime config (env vars, cwd, command, args)
  // Note: some local-only fields (cwd validation, command resolution) won't apply
  // inside the sandbox, but the env vars and args are what we need.
  let runtimeConfig;
  try {
    runtimeConfig = await buildClaudeRuntimeConfig(claudeInput);
  } catch {
    // buildClaudeRuntimeConfig may fail on local path validation — fall back to defaults
    runtimeConfig = null;
  }

  const model = asString(config.model, "");
  const maxTurns = asNumber(config.maxTurnsPerRun, 0);
  const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, true);
  const effort = asString(config.effort, "");
  const extraArgs = runtimeConfig?.extraArgs ?? asStringArray(config.extraArgs);
  const defaultPrompt = buildDefaultPrompt(ctx.context, ctx.agent);
  const promptTemplate = asString(config.promptTemplate, defaultPrompt);

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

  // Build a preview env for meta (actual env is built after sandbox creation)
  const previewEnv = runtimeConfig?.env ?? buildSubstaffEnv(ctx.agent);
  const meta: AdapterInvocationMeta = {
    adapterType: "e2b_sandbox",
    command: "claude",
    commandArgs: [template],
    env: redactEnvForLogs(previewEnv),
  };

  if (ctx.onMeta) {
    await ctx.onMeta(meta);
  }

  let sandbox: Sandbox | null = null;

  try {
    await ctx.onLog("stdout", `[e2b] Creating sandbox from template: ${template}\n`);

    sandbox = await Sandbox.create(template, {
      timeoutMs: sandboxTimeoutSec * 1000,
    });

    await ctx.onLog("stdout", `[e2b] Sandbox created: ${sandbox.sandboxId}\n`);

    // Build sandbox environment from claude-local's env builder + overrides
    const sandboxEnv: Record<string, string> = {};

    // Carry over all env vars from claude-local's runtime config
    if (runtimeConfig) {
      Object.assign(sandboxEnv, runtimeConfig.env);
    } else {
      // Fallback: build Substaff env vars directly when runtimeConfig failed
      Object.assign(sandboxEnv, buildSubstaffEnv(ctx.agent));
      sandboxEnv.SUBSTAFF_RUN_ID = ctx.runId;
      // Inject wake-context env vars from context
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
      // Apply any env vars from adapter config
      const envConfig = parseObject(config.env);
      for (const [key, value] of Object.entries(envConfig)) {
        if (typeof value === "string") sandboxEnv[key] = value;
      }
      // Inject auth token
      if (ctx.authToken && !sandboxEnv.SUBSTAFF_API_KEY) {
        sandboxEnv.SUBSTAFF_API_KEY = ctx.authToken;
      }
    }

    // Ensure ANTHROPIC_API_KEY is set.
    // Priority: ctx.llmApiKey (from key manager) > config.env > process.env
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
        await ctx.onLog("stderr", `[e2b] Warning: No ANTHROPIC_API_KEY available. Claude Code will not work.\n`);
      }
    }

    // Pull workspace files from S3 into sandbox
    const sandboxWorkDir = "/home/user/workspace";
    const sandboxSkillsDir = "/home/user/.skills";
    let pulledFiles: string[] = [];

    await sandbox.commands.run(`mkdir -p ${sandboxWorkDir}`);

    if (ctx.workspaceSync) {
      await ctx.onLog("stdout", `[e2b] Syncing workspace files from storage...\n`);
      try {
        pulledFiles = await ctx.workspaceSync.pullFiles(sandboxWorkDir);
        await ctx.onLog("stdout", `[e2b] Synced ${pulledFiles.length} files into sandbox\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[e2b] Warning: Failed to sync workspace files: ${msg}\n`);
      }
    }

    // Upload skills into sandbox so Claude Code discovers them via --add-dir
    let skillsUploaded = false;
    const localSkillsDir = await resolveSubstaffSkillsDir();
    if (localSkillsDir) {
      try {
        await ctx.onLog("stdout", `[e2b] Uploading skills to sandbox...\n`);
        // Create .claude/skills structure in the skills dir inside sandbox
        const targetSkillsPath = `${sandboxSkillsDir}/.claude/skills`;
        await sandbox.commands.run(`mkdir -p ${targetSkillsPath}`);
        const entries = await fs.readdir(localSkillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillDir = path.join(localSkillsDir, entry.name);
          const skillFiles = await fs.readdir(skillDir);
          await sandbox.commands.run(`mkdir -p ${targetSkillsPath}/${entry.name}`);
          for (const file of skillFiles) {
            const filePath = path.join(skillDir, file);
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) continue;
            const content = await fs.readFile(filePath, "utf-8");
            await sandbox.files.write(`${targetSkillsPath}/${entry.name}/${file}`, content);
          }
          // Also copy references/ subdirectory if present
          const refsDir = path.join(skillDir, "references");
          const hasRefs = await fs.stat(refsDir).then((s) => s.isDirectory()).catch(() => false);
          if (hasRefs) {
            await sandbox.commands.run(`mkdir -p ${targetSkillsPath}/${entry.name}/references`);
            const refFiles = await fs.readdir(refsDir);
            for (const file of refFiles) {
              const filePath = path.join(refsDir, file);
              const stat = await fs.stat(filePath);
              if (!stat.isFile()) continue;
              const content = await fs.readFile(filePath, "utf-8");
              await sandbox.files.write(`${targetSkillsPath}/${entry.name}/references/${file}`, content);
            }
          }
        }
        skillsUploaded = true;
        await ctx.onLog("stdout", `[e2b] Skills uploaded to sandbox\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[e2b] Warning: Failed to upload skills: ${msg}\n`);
      }
    }

    // Upload agent instructions file if configured
    const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
    let sandboxInstructionsPath: string | null = null;
    if (instructionsFilePath) {
      try {
        const instructionsContent = await fs.readFile(instructionsFilePath, "utf-8");
        const instructionsFileDir = `${path.dirname(instructionsFilePath)}/`;
        const pathDirective = `\nThe above agent instructions were loaded from ${instructionsFilePath}. Resolve any relative file references from ${instructionsFileDir}.`;
        sandboxInstructionsPath = "/home/user/agent-instructions.md";
        await sandbox.files.write(sandboxInstructionsPath, instructionsContent + pathDirective);
        await ctx.onLog("stdout", `[e2b] Agent instructions uploaded to sandbox\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[e2b] Warning: Failed to upload agent instructions: ${msg}\n`);
        sandboxInstructionsPath = null;
      }
    }

    // Install Claude Code CLI
    await ctx.onLog("stdout", `[e2b] Installing Claude Code CLI...\n`);
    const installResult = await sandbox.commands.run(
      "npm install -g @anthropic-ai/claude-code 2>&1",
      { envs: sandboxEnv, timeoutMs: 120_000 },
    );
    if (installResult.exitCode !== 0) {
      await ctx.onLog("stderr", `[e2b] Claude Code install failed: ${installResult.stdout}\n`);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Failed to install Claude Code CLI: ${installResult.stdout}`,
        errorCode: "E2B_INSTALL_ERROR",
      };
    }
    await ctx.onLog("stdout", `[e2b] Claude Code CLI installed\n`);

    // Build Claude CLI args (same flags as claude-local)
    const claudeArgs = ["--print", "-", "--output-format", "stream-json", "--verbose"];
    if (dangerouslySkipPermissions) claudeArgs.push("--dangerously-skip-permissions");
    if (model) claudeArgs.push("--model", model);
    if (effort) claudeArgs.push("--effort", effort);
    if (maxTurns > 0) claudeArgs.push("--max-turns", String(maxTurns));
    if (sandboxInstructionsPath) claudeArgs.push("--append-system-prompt-file", sandboxInstructionsPath);
    if (skillsUploaded) claudeArgs.push("--add-dir", sandboxSkillsDir);
    if (extraArgs.length > 0) claudeArgs.push(...extraArgs);

    // Write prompt to a file, then pipe it to claude via stdin
    const promptPath = "/home/user/.substaff-prompt.txt";
    await sandbox.files.write(promptPath, prompt);

    // Use --print with prompt file piped via stdin; also disable telemetry and
    // accept terms non-interactively to prevent Claude Code from hanging.
    const claudeCommand = `DISABLE_AUTOUPDATER=1 cat ${promptPath} | claude ${claudeArgs.join(" ")}`;

    await ctx.onLog("stdout", `[e2b] Running Claude Code in sandbox...\n`);

    const timeoutSec = runtimeConfig?.timeoutSec || asNumber(config.timeoutSec, 0);
    const execTimeoutMs = timeoutSec > 0
      ? timeoutSec * 1000
      : (sandboxTimeoutSec - 60) * 1000; // leave 60s buffer

    // Use streaming callbacks so logs appear in real-time in the UI
    let stdout = "";
    let stderr = "";
    const execution = await sandbox.commands.run(claudeCommand, {
      envs: sandboxEnv,
      cwd: sandboxWorkDir,
      timeoutMs: execTimeoutMs,
      onStdout: (data) => {
        stdout += data;
        void ctx.onLog("stdout", data);
      },
      onStderr: (data) => {
        stderr += data;
        void ctx.onLog("stderr", data);
      },
    });

    // Parse Claude's stream-json output (reuse claude-local's parser)
    const parsed = parseClaudeStreamJson(stdout);
    const loginMeta = detectClaudeLoginRequired({ parsed: parsed.resultJson, stdout, stderr });

    // Push modified files back to S3
    if (ctx.workspaceSync) {
      await ctx.onLog("stdout", `[e2b] Syncing workspace files back to storage...\n`);
      try {
        await ctx.workspaceSync.pushFiles(sandboxWorkDir, pulledFiles);
        await ctx.onLog("stdout", `[e2b] Workspace files synced back to storage\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[e2b] Warning: Failed to sync files back: ${msg}\n`);
      }
    }

    const timedOut = execution.exitCode === 124;
    if (timedOut) {
      return {
        exitCode: execution.exitCode,
        signal: null,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec || sandboxTimeoutSec}s`,
        errorCode: "timeout",
      };
    }

    if (!parsed.resultJson) {
      const stderrLines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const stderrExcerpt = stderrLines.slice(0, 5).join("; ");

      // Log full stdout/stderr for debugging when Claude fails
      if ((execution.exitCode ?? 0) !== 0) {
        await ctx.onLog("stderr", `[e2b] Claude exited with code ${execution.exitCode}. stderr: ${stderr || "(empty)"}\n`);
        if (stdout) {
          await ctx.onLog("stderr", `[e2b] stdout (first 2000 chars): ${stdout.slice(0, 2000)}\n`);
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

    await ctx.onLog("stdout", `[e2b] Execution complete. Exit code: ${execution.exitCode}\n`);

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
        ? ({ sessionId: parsed.sessionId, cwd: sandboxWorkDir } as Record<string, unknown>)
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
    const message = err instanceof Error ? err.message : String(err);
    await ctx.onLog("stderr", `[e2b] Error: ${message}\n`);

    // E2B SDK may attach stdout/stderr to the error object on non-zero exits
    const errRecord = err as Record<string, unknown> | null;
    const errStdout = typeof errRecord?.stdout === "string" ? errRecord.stdout : "";
    const errStderr = typeof errRecord?.stderr === "string" ? errRecord.stderr : "";
    const errExitCode = typeof errRecord?.exitCode === "number" ? errRecord.exitCode : 1;

    if (errStdout) {
      await ctx.onLog("stdout", `[e2b] Captured stdout:\n${errStdout}\n`);
    }
    if (errStderr) {
      await ctx.onLog("stderr", `[e2b] Captured stderr:\n${errStderr}\n`);
    }

    // Also log the full stack trace for debugging
    if (err instanceof Error && err.stack) {
      await ctx.onLog("stderr", `[e2b] Stack: ${err.stack}\n`);
    }

    return {
      exitCode: errExitCode,
      signal: null,
      timedOut: message.includes("timeout"),
      errorMessage: errStderr ? `${message}: ${errStderr.split("\n").filter(Boolean).slice(0, 3).join("; ")}` : message,
      errorCode: "E2B_EXECUTION_ERROR",
      resultJson: errStdout || errStderr ? { stdout: errStdout, stderr: errStderr } : undefined,
    };
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        // Sandbox may already be terminated
      }
    }
  }
}

function buildDefaultPrompt(
  context: Record<string, unknown>,
  agent: { id: string; name?: string | null },
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
  return parts.join("");
}

/** Escape a string for safe use in a shell command (single-quote wrapping). */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
