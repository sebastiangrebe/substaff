// BullMQ connection utilities.
// BullMQ uses its own bundled ioredis, so we pass URL strings instead of Redis instances
// to avoid version conflicts between our ioredis and BullMQ's bundled one.

// This file is kept minimal — the actual queue/worker initialization uses { url: redisUrl }
// passed directly to BullMQ Queue/Worker constructors.

export {} // no-op, kept for potential future use
