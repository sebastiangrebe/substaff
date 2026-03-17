import { Sandbox } from "e2b";

/**
 * Kill an E2B sandbox by ID.
 * Called when a run is cancelled (e.g. agent pause) to stop remote execution.
 */
export async function cancelRun(externalRunId: string): Promise<void> {
  await Sandbox.kill(externalRunId);
}
