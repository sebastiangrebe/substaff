import { Sandbox } from "e2b";
import type { OrphanedRunResumeContext, OrphanedRunResumeResult } from "@substaff/adapter-utils";
import { pushFilesToStorage } from "./execute.js";

/**
 * Attempt to reconnect to an orphaned E2B sandbox after a server restart.
 * - If the sandbox is still alive and Claude is running → "still_running"
 * - If the sandbox is alive but Claude finished → push files, "completed"
 * - If the sandbox is unreachable → "unreachable"
 */
export async function tryResumeOrphanedRun(
  ctx: OrphanedRunResumeContext,
): Promise<OrphanedRunResumeResult> {
  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.connect(ctx.externalRunId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: "unreachable", reason };
  }

  try {
    await ctx.onLog("stdout", `[e2b] Reconnected to sandbox ${ctx.externalRunId} after server restart\n`);

    // Push any workspace files the sandbox produced before/during restart
    let filesUploaded = 0;
    if (ctx.storageService) {
      try {
        filesUploaded = await pushFilesToStorage(
          sandbox, ctx.storageService, ctx.companyId,
          "/home/user/workspace", "workspace", ctx.onLog,
        );
        await ctx.onLog("stdout", `[e2b] Pushed ${filesUploaded} files from reconnected sandbox\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[e2b] Warning: Failed to push files from reconnected sandbox: ${msg}\n`);
      }
    }

    // Check if the Claude process is still running
    const psResult = await sandbox.commands.run("pgrep -f 'claude' || true", { timeoutMs: 5_000 });
    const claudeStillRunning = psResult.stdout.trim().length > 0;

    if (claudeStillRunning) {
      // Sandbox stays alive — heartbeat service will re-fire executeRun
      return { status: "still_running" };
    }

    // Claude finished while we were down — clean up the sandbox
    try {
      await sandbox.kill();
    } catch {
      // Best effort
    }

    return { status: "completed", filesUploaded };
  } catch (err) {
    // On any error during resume, try to clean up the sandbox
    try {
      const psCheck = await sandbox.commands.run("pgrep -f 'claude' || true", { timeoutMs: 3_000 });
      if (!psCheck.stdout.trim()) {
        await sandbox.kill();
      }
    } catch {
      // Best effort cleanup
    }

    const reason = err instanceof Error ? err.message : String(err);
    return { status: "unreachable", reason };
  }
}
