import { SandboxInstance } from "@blaxel/core";

/**
 * Kill all running processes inside a Blaxel sandbox without deleting it.
 * This preserves the persistent sandbox filesystem (agent memory, installed tools)
 * while stopping any in-flight execution.
 */
export async function cancelRun(externalRunId: string): Promise<void> {
  const sandbox = await SandboxInstance.get(externalRunId);
  const processes = await sandbox.process.list();
  for (const proc of processes) {
    if (proc.status === "running") {
      try {
        await sandbox.process.kill(proc.pid);
      } catch {
        // Process may have already exited
      }
    }
  }
}
