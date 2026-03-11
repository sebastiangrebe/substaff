import { Queue, Worker } from "bullmq";
import type { Db } from "@substaff/db";
import { logger } from "../middleware/logger.js";

export const HEARTBEAT_SCHEDULER_QUEUE = "heartbeat-scheduler";

export type HeartbeatSchedulerJobData =
  | { type: "tick-timers" }
  | { type: "reap-orphans" };

export function initHeartbeatSchedulerQueue(redisUrl: string, intervalMs: number) {
  const queue = new Queue(HEARTBEAT_SCHEDULER_QUEUE, {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  // Repeatable: tick agent timers at the configured interval
  void queue.upsertJobScheduler(
    "heartbeat-tick",
    { every: intervalMs },
    { name: "heartbeat-tick", data: { type: "tick-timers" as const } },
  );

  // Repeatable: reap orphaned runs every 5 minutes
  void queue.upsertJobScheduler(
    "reap-orphans",
    { every: 5 * 60 * 1000 },
    { name: "reap-orphans", data: { type: "reap-orphans" as const } },
  );

  return queue;
}

export async function createHeartbeatSchedulerWorker(redisUrl: string, db: Db) {
  const hb = (await import("../services/heartbeat.js")).heartbeatService(db);

  const worker = new Worker(
    HEARTBEAT_SCHEDULER_QUEUE,
    async (job) => {
      const data = job.data as HeartbeatSchedulerJobData;

      switch (data.type) {
        case "tick-timers": {
          const result = await hb.tickTimers(new Date());
          if (result.enqueued > 0) {
            logger.info({ ...result }, "heartbeat timer tick enqueued runs");
          }
          break;
        }

        case "reap-orphans": {
          const result = await hb.reapOrphanedRuns({ staleThresholdMs: 5 * 60 * 1000 });
          if (result.reaped > 0 || result.resumed > 0) {
            logger.info({ ...result }, "heartbeat orphan reap completed");
          }
          break;
        }
      }
    },
    {
      connection: { url: redisUrl },
      // Sequential: only one tick/reap should run at a time
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, type: (job?.data as HeartbeatSchedulerJobData)?.type, err },
      "Heartbeat scheduler job failed",
    );
  });

  return worker;
}
