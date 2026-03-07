import { EventEmitter } from "node:events";
import type { LiveEvent, LiveEventType } from "@substaff/shared";
import { getRedisPub, getRedisSub } from "./redis.js";

type LiveEventPayload = Record<string, unknown>;
type LiveEventListener = (event: LiveEvent) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const CHANNEL_PREFIX = "substaff:live:";

let nextEventId = 0;

function toLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}): LiveEvent {
  nextEventId += 1;
  return {
    id: nextEventId,
    companyId: input.companyId,
    type: input.type,
    createdAt: new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

export function publishLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  const event = toLiveEvent(input);
  const pub = getRedisPub();
  if (pub) {
    const channel = CHANNEL_PREFIX + input.companyId;
    pub.publish(channel, JSON.stringify(event)).catch(() => {});
  }
  // Always emit locally so in-process WebSocket listeners receive events
  // even when Redis is active (the WS server subscribes via subscribeCompanyLiveEvents)
  emitter.emit(input.companyId, event);
  return event;
}

const redisSubscriptions = new Map<string, number>();

export function subscribeCompanyLiveEvents(companyId: string, listener: LiveEventListener) {
  emitter.on(companyId, listener);

  const sub = getRedisSub();
  if (sub) {
    const channel = CHANNEL_PREFIX + companyId;
    const count = redisSubscriptions.get(channel) ?? 0;
    if (count === 0) {
      sub.subscribe(channel).catch(() => {});
      sub.on("message", handleRedisMessage);
    }
    redisSubscriptions.set(channel, count + 1);
  }

  return () => {
    emitter.off(companyId, listener);

    if (sub) {
      const channel = CHANNEL_PREFIX + companyId;
      const count = (redisSubscriptions.get(channel) ?? 1) - 1;
      if (count <= 0) {
        redisSubscriptions.delete(channel);
        sub.unsubscribe(channel).catch(() => {});
      } else {
        redisSubscriptions.set(channel, count);
      }
    }
  };
}

function handleRedisMessage(channel: string, message: string) {
  if (!channel.startsWith(CHANNEL_PREFIX)) return;
  const companyId = channel.slice(CHANNEL_PREFIX.length);
  try {
    const event = JSON.parse(message) as LiveEvent;
    emitter.emit(companyId, event);
  } catch {
    // ignore malformed messages
  }
}
