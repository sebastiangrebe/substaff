import type { Db } from "@substaff/db";
import type { Worker } from "bullmq";
import { initCostProcessingQueue, createCostProcessingWorker } from "./cost-processing.js";
import { initBillingSyncQueue, createBillingSyncWorker } from "./billing-sync.js";
import { initEmailAlertsQueue, createEmailAlertsWorker } from "./email-alerts.js";
import { initHeartbeatRunsQueue, createHeartbeatRunsWorker } from "./heartbeat-runs.js";
import { initHeartbeatSchedulerQueue, createHeartbeatSchedulerWorker } from "./heartbeat-scheduler.js";
import { logger } from "../middleware/logger.js";

const workers: Worker[] = [];

export interface InitQueuesOptions {
  heartbeatSchedulerEnabled?: boolean;
  heartbeatSchedulerIntervalMs?: number;
}

export async function initQueues(redisUrl: string, db: Db, opts?: InitQueuesOptions) {
  // Initialize queues (use URL string to avoid ioredis version conflicts)
  initCostProcessingQueue(redisUrl);
  initBillingSyncQueue(redisUrl);
  initEmailAlertsQueue(redisUrl);
  initHeartbeatRunsQueue(redisUrl);

  if (opts?.heartbeatSchedulerEnabled !== false) {
    initHeartbeatSchedulerQueue(redisUrl, opts?.heartbeatSchedulerIntervalMs ?? 30000);
  }

  // Start workers
  workers.push(
    createCostProcessingWorker(redisUrl, db),
    createBillingSyncWorker(redisUrl, db),
    createEmailAlertsWorker(redisUrl, db),
    await createHeartbeatRunsWorker(redisUrl, db),
  );

  if (opts?.heartbeatSchedulerEnabled !== false) {
    workers.push(await createHeartbeatSchedulerWorker(redisUrl, db));
  }

  logger.info("BullMQ queues and workers initialized");
}

export async function shutdownQueues() {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers.length = 0;
  logger.info("BullMQ queues and workers shut down");
}

export { enqueueCostProcessing } from "./cost-processing.js";
export type { CostProcessingJobData } from "./cost-processing.js";
export { enqueueEmailAlert } from "./email-alerts.js";
export type { EmailAlertJobData } from "./email-alerts.js";
export { enqueueRunExecution } from "./heartbeat-runs.js";
export type { HeartbeatRunJobData } from "./heartbeat-runs.js";
