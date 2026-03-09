import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox } from "e2b";
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

/**
 * E2B sandbox adapter — runs Claude Code CLI inside an isolated E2B microVM.
 *
 * Uses claude-local's config/env/arg building logic, but executes via
 * sandbox.commands.run() instead of a local child process.
 */
export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);
  const template = asString(config.template, "substaff-claude");
  const timeoutSec = asNumber(config.timeoutSec, 0) || DEFAULT_AGENT_TIMEOUT_SEC;

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
  const customPromptTemplate = asString(config.promptTemplate, "");
  // Prompt will be built later after persona files are loaded

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
      timeoutMs: timeoutSec * 1000,
    });

    await ctx.onLog("stdout", `[e2b] Sandbox created: ${sandbox.sandboxId}\n`);

    // Persist sandbox ID so the server can reconnect after a restart
    if (ctx.onExternalRunId) {
      await ctx.onExternalRunId(sandbox.sandboxId);
    }

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

    const sandboxWorkDir = "/home/user/workspace";
    const sandboxSkillsDir = "/home/user/.skills";
    const storageNamespace = "workspace";

    await sandbox.commands.run(`mkdir -p ${sandboxWorkDir}`);

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

    // Upload company template files (agent persona files) into the workspace
    // Also collect persona content to inject into system prompt (saves agent reading time)
    const personaContents: Record<string, string> = {};
    const companiesDir = await resolveCompaniesDir();
    if (companiesDir) {
      try {
        const agentRole = (ctx.agent as unknown as Record<string, unknown>).role;
        const role = typeof agentRole === "string" && agentRole ? agentRole : "ceo";
        const roleDir = path.join(companiesDir, "default", role);
        const roleDirExists = await fs.stat(roleDir).then((s) => s.isDirectory()).catch(() => false);
        if (roleDirExists) {
          const targetDir = `${sandboxWorkDir}/agents/${role}`;
          await sandbox.commands.run(`mkdir -p ${targetDir}`);
          const files = await fs.readdir(roleDir);
          for (const file of files) {
            const filePath = path.join(roleDir, file);
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) continue;
            const content = await fs.readFile(filePath, "utf-8");
            await sandbox.files.write(`${targetDir}/${file}`, content);
            personaContents[file] = content;
          }
          await ctx.onLog("stdout", `[e2b] Agent persona files uploaded (${role})\n`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[e2b] Warning: Failed to upload company templates: ${msg}\n`);
      }
    }

    // Load agent instructions file if configured.
    // For E2B, the instructionsFilePath is a sandbox path (e.g. /home/user/workspace/agents/…/AGENTS.md).
    // The file may already exist in the sandbox (uploaded by persona template above).
    // If not, try to fetch it from storage (pushed by a previous run).
    // Agents can access other workspace files on-demand via the files API — we only pre-load instructions.
    const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
    let sandboxInstructionsPath: string | null = null;
    if (instructionsFilePath) {
      let instructionsContent: string | null = null;

      // 1. Try reading from sandbox (persona template or E2B template may have placed it)
      try {
        instructionsContent = await sandbox.files.read(instructionsFilePath);
      } catch {
        // Not in sandbox yet — try storage
      }

      // 2. Fall back to fetching from agent's storage namespace
      if (!instructionsContent && ctx.storageService && instructionsFilePath.startsWith(sandboxWorkDir + "/")) {
        try {
          const relativePath = instructionsFilePath.slice(sandboxWorkDir.length + 1);
          const objectKey = `${ctx.agent.companyId}/${storageNamespace}/${relativePath}`;
          await pullSingleFileFromStorage(
            sandbox, ctx.storageService, ctx.agent.companyId,
            objectKey, instructionsFilePath,
          );
          instructionsContent = await sandbox.files.read(instructionsFilePath);
          await ctx.onLog("stdout", `[e2b] Agent instructions fetched from storage\n`);
        } catch {
          // Not in storage either
        }
      }

      if (instructionsContent) {
        try {
          const instructionsFileDir = `${path.posix.dirname(instructionsFilePath)}/`;
          const pathDirective = `\nThe above agent instructions were loaded from ${instructionsFilePath}. Resolve any relative file references from ${instructionsFileDir}.`;
          sandboxInstructionsPath = "/home/user/agent-instructions.md";
          await sandbox.files.write(sandboxInstructionsPath, instructionsContent + pathDirective);
          await ctx.onLog("stdout", `[e2b] Agent instructions loaded\n`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await ctx.onLog("stderr", `[e2b] Warning: Failed to write agent instructions: ${msg}\n`);
          sandboxInstructionsPath = null;
        }
      } else {
        await ctx.onLog("stderr", `[e2b] Warning: Agent instructions file not found: ${instructionsFilePath}\n`);
      }
    }

    // Install Claude Code CLI (skip if already present in template)
    let claudeAlreadyInstalled = false;
    try {
      const claudeCheck = await sandbox.commands.run("which claude 2>/dev/null || true", { timeoutMs: 5_000 });
      claudeAlreadyInstalled = claudeCheck.exitCode === 0 && claudeCheck.stdout.trim().length > 0;
    } catch {
      // which failed — CLI not present
    }
    if (claudeAlreadyInstalled) {
      await ctx.onLog("stdout", `[e2b] Claude Code CLI already installed in template\n`);
    } else {
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
    }

    // Build Claude CLI args (same flags as claude-local)
    const claudeArgs = ["--print", "-", "--output-format", "stream-json", "--verbose"];
    if (dangerouslySkipPermissions) claudeArgs.push("--dangerously-skip-permissions");
    if (model) claudeArgs.push("--model", model);
    if (effort) claudeArgs.push("--effort", effort);
    if (maxTurns > 0) claudeArgs.push("--max-turns", String(maxTurns));
    if (sandboxInstructionsPath) claudeArgs.push("--append-system-prompt-file", sandboxInstructionsPath);
    if (skillsUploaded) claudeArgs.push("--add-dir", sandboxSkillsDir);
    if (extraArgs.length > 0) claudeArgs.push(...extraArgs);

    // Write MCP config if integrations are configured
    if (ctx.mcpConfig) {
      const mcpServers = (ctx.mcpConfig as { mcpServers?: Record<string, { command: string; args: string[]; env: Record<string, string> } > }).mcpServers;
      if (mcpServers && Object.keys(mcpServers).length > 0) {
        // Some MCP servers need credentials written as files rather than env vars.
        // For google-drive (@a-bonus/google-docs-mcp): write the OAuth token
        // to the XDG config path it reads at startup, and pass client ID/secret
        // as env vars (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).
        const gdriveServer = mcpServers["google-drive"];
        if (gdriveServer?.env) {
          const tokenJson = gdriveServer.env["GOOGLE_DOCS_MCP_TOKEN"];
          if (tokenJson) {
            const tokenDir = "/home/user/.config/google-docs-mcp";
            const tokenPath = `${tokenDir}/token.json`;
            await sandbox.files.write(tokenPath, tokenJson);
            delete gdriveServer.env["GOOGLE_DOCS_MCP_TOKEN"];
          }
        }

        const mcpConfigPath = "/home/user/.mcp-config.json";
        await sandbox.files.write(mcpConfigPath, JSON.stringify({ mcpServers }, null, 2));
        claudeArgs.push("--mcp-config", mcpConfigPath);
        await ctx.onLog("stdout", `[e2b] MCP config written with servers: ${Object.keys(mcpServers).join(", ")}\n`);
      }
    }

    // Build prompt now that persona files are available
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
    await sandbox.files.write(promptPath, prompt);

    // Use --print with prompt file piped via stdin; also disable telemetry and
    // accept terms non-interactively to prevent Claude Code from hanging.
    const claudeCommand = `DISABLE_AUTOUPDATER=1 cat ${promptPath} | claude ${claudeArgs.join(" ")}`;

    await ctx.onLog("stdout", `[e2b] Running Claude Code in sandbox...\n`);

    const execTimeoutMs = (timeoutSec - 60) * 1000; // leave 60s buffer for sandbox teardown

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

    // Push workspace files back to S3
    if (ctx.storageService) {
      await ctx.onLog("stdout", `[e2b] Pushing workspace files to storage...\n`);
      try {
        const uploadedCount = await pushFilesToStorage(
          sandbox, ctx.storageService, ctx.agent.companyId,
          sandboxWorkDir, storageNamespace, ctx.onLog,
        );
        await ctx.onLog("stdout", `[e2b] Pushed ${uploadedCount} files to storage\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[e2b] Warning: Failed to push files to storage: ${msg}\n`);
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

    // Best-effort: push any files the agent created before the error
    if (sandbox && ctx.storageService) {
      try {
        const storageNs = "workspace";
        await pushFilesToStorage(sandbox, ctx.storageService, ctx.agent.companyId, "/home/user/workspace", storageNs, ctx.onLog);
      } catch {
        // Ignore — sandbox may already be dead
      }
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

/**
 * Guess MIME type from file extension using the `mime-types` package
 * (available at runtime in the server, not declared as a direct dependency).
 * Falls back to application/octet-stream if the package isn't available.
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

/** Fetch a single file from storage and write it into the sandbox. Returns true on success. */
async function pullSingleFileFromStorage(
  sandbox: Sandbox,
  storage: StorageServiceLike,
  companyId: string,
  objectKey: string,
  targetPath: string,
): Promise<boolean> {
  const result = await storage.getObject(companyId, objectKey);
  const byteChunks: ArrayBuffer[] = [];
  let totalLen = 0;
  for await (const chunk of result.stream) {
    const buf = Buffer.from(chunk as ArrayBuffer);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    byteChunks.push(ab);
    totalLen += ab.byteLength;
  }
  const content = new Uint8Array(totalLen);
  let offset = 0;
  for (const ab of byteChunks) { content.set(new Uint8Array(ab), offset); offset += ab.byteLength; }

  const targetDir = path.posix.dirname(targetPath);
  await sandbox.commands.run(`mkdir -p ${shellEscape(targetDir)}`);
  await sandbox.files.write(targetPath, content.buffer as ArrayBuffer);
  return true;
}

/** Push workspace files from the sandbox back to S3 storage. */
export async function pushFilesToStorage(
  sandbox: Sandbox,
  storage: StorageServiceLike,
  companyId: string,
  workDir: string,
  namespace: string,
  onLog: AdapterExecutionContext["onLog"],
): Promise<number> {
  // List all files in the workspace (exclude hidden dirs like .git, node_modules)
  const findResult = await sandbox.commands.run(
    `find ${shellEscape(workDir)} -type f ` +
    `-not -path '*/node_modules/*' ` +
    `-not -path '*/.git/*' ` +
    `-not -path '*/.claude/*' ` +
    `-not -name '.substaff-prompt.txt' ` +
    `2>/dev/null || true`,
    { timeoutMs: 30_000 },
  );

  const files = findResult.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  if (files.length === 0) return 0;

  let uploaded = 0;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit per file

  for (const absolutePath of files) {
    try {
      const content = await sandbox.files.read(absolutePath, { format: "bytes" });
      const body = Buffer.from(content);

      if (body.length === 0 || body.length > MAX_FILE_SIZE) continue;

      // Compute relative path from workDir
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
  // Inject project state (global context window) if available
  const projectState = typeof context.projectState === "string" && context.projectState ? context.projectState : null;
  if (projectState) {
    parts.push("\n\n--- PROJECT STATE (shared context across all agents) ---");
    parts.push(`\n${projectState.trim()}`);
    parts.push("\n--- END PROJECT STATE ---");
  }

  parts.push("\n\nYou are running inside an E2B sandbox. Your workspace is /home/user/workspace.");
  parts.push("Agent persona files have been pre-loaded into agents/<role>/ in your workspace. Do NOT try to download them from GitHub.");

  // Inject persona content directly so the agent doesn't need to read the files
  if (personaContents && Object.keys(personaContents).length > 0) {
    parts.push("\n\n--- AGENT PERSONA (pre-loaded, no need to read these files) ---");
    // Order: AGENTS.md first (main instructions), then HEARTBEAT, SOUL, TOOLS
    const orderedFiles = ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"];
    for (const file of orderedFiles) {
      if (personaContents[file]) {
        parts.push(`\n\n### ${file}\n${personaContents[file].trim()}`);
      }
    }
    // Any remaining files not in the ordered list
    for (const [file, content] of Object.entries(personaContents)) {
      if (!orderedFiles.includes(file)) {
        parts.push(`\n\n### ${file}\n${content.trim()}`);
      }
    }
    parts.push("\n\n--- END AGENT PERSONA ---");
    parts.push("\n\nIMPORTANT: You already have your persona and heartbeat instructions above. Start your heartbeat procedure immediately — load the /substaff skill and begin working. Do NOT re-read the persona files from disk.");
  }

  return parts.join("");
}

/** Escape a string for safe use in a shell command (single-quote wrapping). */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
