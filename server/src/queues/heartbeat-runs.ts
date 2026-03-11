import { Queue, Worker } from "bullmq";
import type { Db } from "@substaff/db";
import { logger } from "../middleware/logger.js";

export const HEARTBEAT_RUNS_QUEUE = "heartbeat-runs";

export interface HeartbeatRunJobData {
  runId: string;
}

let queue: Queue | null = null;

export function getHeartbeatRunsQueue(): Queue | null {
  return queue;
}

export function initHeartbeatRunsQueue(redisUrl: string) {
  queue = new Queue(HEARTBEAT_RUNS_QUEUE, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      // No retries: executeRun handles its own error recovery and DB status.
      // BullMQ retries would cause double-execution.
      attempts: 1,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });
  return queue;
}

export function enqueueRunExecution(runId: string) {
  if (!queue) {
    logger.warn("Heartbeat runs queue not initialized — cannot enqueue run");
    return null;
  }
  // Use runId as jobId for deduplication: same run won't be enqueued twice
  return queue.add("execute-run", { runId }, { jobId: `run-${runId}` });
}

export async function createHeartbeatRunsWorker(redisUrl: string, db: Db) {
  const hb = (await import("../services/heartbeat.js")).heartbeatService(db);

  const worker = new Worker(
    HEARTBEAT_RUNS_QUEUE,
    async (job) => {
      const { runId } = job.data as HeartbeatRunJobData;
      await hb.executeRun(runId);
    },
    {
      connection: { url: redisUrl },
      concurrency: Number(process.env.HEARTBEAT_RUN_WORKER_CONCURRENCY) || 10,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, runId: (job?.data as HeartbeatRunJobData)?.runId, err },
      "Heartbeat run execution job failed",
    );
  });

  return worker;
}
