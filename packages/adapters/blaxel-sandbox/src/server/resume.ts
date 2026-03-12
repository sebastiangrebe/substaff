import { SandboxInstance } from "@blaxel/core";
import type { OrphanedRunResumeContext, OrphanedRunResumeResult } from "@substaff/adapter-utils";
import { pushFilesToStorage } from "./execute.js";

/**
 * Attempt to reconnect to an orphaned Blaxel sandbox after a server restart.
 * - If the sandbox is still alive and Claude is running → "still_running"
 * - If the sandbox is alive but Claude finished → push files, "completed"
 * - If the sandbox is unreachable → "unreachable"
 */
export async function tryResumeOrphanedRun(
  ctx: OrphanedRunResumeContext,
): Promise<OrphanedRunResumeResult> {
  let sandbox: SandboxInstance;
  try {
    sandbox = await SandboxInstance.get(ctx.externalRunId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: "unreachable", reason };
  }

  try {
    await ctx.onLog("stdout", `[blaxel] Reconnected to sandbox ${ctx.externalRunId} after server restart\n`);

    // Push any workspace files the sandbox produced before/during restart
    let filesUploaded = 0;
    if (ctx.storageService) {
      try {
        filesUploaded = await pushFilesToStorage(
          sandbox, ctx.storageService, ctx.companyId,
          "/home/user/workspace", "workspace", ctx.onLog,
        );
        await ctx.onLog("stdout", `[blaxel] Pushed ${filesUploaded} files from reconnected sandbox\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.onLog("stderr", `[blaxel] Warning: Failed to push files from reconnected sandbox: ${msg}\n`);
      }
    }

    // Check if the Claude process is still running
    const psResult = await sandbox.process.exec({
      command: "pgrep -f 'claude' || true",
      waitForCompletion: true,
      timeout: 5,
    });
    const claudeStillRunning = (psResult.stdout ?? "").trim().length > 0;

    if (claudeStillRunning) {
      // Sandbox stays alive — heartbeat service will re-fire executeRun
      return { status: "still_running" };
    }

    // Claude finished while we were down — sandbox auto-suspends, no need to kill
    return { status: "completed", filesUploaded };
  } catch (err) {
    // On any error during resume, check if Claude is still running
    try {
      const psCheck = await sandbox.process.exec({
        command: "pgrep -f 'claude' || true",
        waitForCompletion: true,
        timeout: 3,
      });
      // If Claude is not running, sandbox will auto-suspend — nothing to clean up
      if ((psCheck.stdout ?? "").trim()) {
        // Claude still running — let heartbeat retry
        return { status: "still_running" };
      }
    } catch {
      // Best effort
    }

    const reason = err instanceof Error ? err.message : String(err);
    return { status: "unreachable", reason };
  }
}
