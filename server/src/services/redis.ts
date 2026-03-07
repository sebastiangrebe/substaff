import { Redis } from "ioredis";
import { logger } from "../middleware/logger.js";

let pub: Redis | null = null;
let sub: Redis | null = null;

export function initRedis(url: string) {
  pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  sub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });

  pub.on("error", (err: Error) => logger.error({ err }, "Redis pub client error"));
  sub.on("error", (err: Error) => logger.error({ err }, "Redis sub client error"));

  return Promise.all([pub.connect(), sub.connect()]).then(() => {
    logger.info("Redis pub/sub connected");
  });
}

export function getRedisPub(): Redis | null {
  return pub;
}

export function getRedisSub(): Redis | null {
  return sub;
}

export async function shutdownRedis() {
  await Promise.allSettled([pub?.quit(), sub?.quit()]);
  pub = null;
  sub = null;
}
