import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { notFound } from "../errors.js";
import { getStorageService } from "../storage/index.js";
import type { StorageService } from "../storage/types.js";

export type RunLogStoreType = "local_file" | "object_store";

export interface RunLogHandle {
  store: RunLogStoreType;
  logRef: string;
  /** Temp local path used during append phase before upload to object store. */
  _tempPath?: string;
  /** Company ID needed for object store operations. */
  _companyId?: string;
}

export interface RunLogReadOptions {
  offset?: number;
  limitBytes?: number;
}

export interface RunLogReadResult {
  content: string;
  nextOffset?: number;
}

export interface RunLogFinalizeSummary {
  bytes: number;
  sha256?: string;
  compressed: boolean;
}

export interface RunLogStore {
  begin(input: { companyId: string; agentId: string; runId: string }): Promise<RunLogHandle>;
  append(
    handle: RunLogHandle,
    event: { stream: "stdout" | "stderr" | "system"; chunk: string; ts: string },
  ): Promise<void>;
  finalize(handle: RunLogHandle): Promise<RunLogFinalizeSummary>;
  read(handle: RunLogHandle, opts?: RunLogReadOptions): Promise<RunLogReadResult>;
}

function safeSegments(...segments: string[]) {
  return segments.map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

function resolveWithin(basePath: string, relativePath: string) {
  const resolved = path.resolve(basePath, relativePath);
  const base = path.resolve(basePath) + path.sep;
  if (!resolved.startsWith(base) && resolved !== path.resolve(basePath)) {
    throw new Error("Invalid log path");
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Local file backend (unchanged)
// ---------------------------------------------------------------------------

function createLocalFileRunLogStore(basePath: string): RunLogStore {
  async function ensureDir(relativeDir: string) {
    const dir = resolveWithin(basePath, relativeDir);
    await fs.mkdir(dir, { recursive: true });
  }

  async function readFileRange(filePath: string, offset: number, limitBytes: number): Promise<RunLogReadResult> {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) throw notFound("Run log not found");

    const start = Math.max(0, Math.min(offset, stat.size));
    const end = Math.max(start, Math.min(start + limitBytes - 1, stat.size - 1));

    if (start > end) {
      return { content: "", nextOffset: start };
    }

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath, { start, end });
      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });

    const content = Buffer.concat(chunks as Uint8Array[]).toString("utf8");
    const nextOffset = end + 1 < stat.size ? end + 1 : undefined;
    return { content, nextOffset };
  }

  async function sha256File(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk: string | Buffer) => hash.update(typeof chunk === "string" ? chunk : new Uint8Array(chunk)));
      stream.on("error", reject);
      stream.on("end", () => resolve(hash.digest("hex")));
    });
  }

  return {
    async begin(input) {
      const [companyId, agentId] = safeSegments(input.companyId, input.agentId);
      const runId = safeSegments(input.runId)[0]!;
      const relDir = path.join(companyId, agentId);
      const relPath = path.join(relDir, `${runId}.ndjson`);
      await ensureDir(relDir);

      const absPath = resolveWithin(basePath, relPath);
      await fs.writeFile(absPath, "", "utf8");

      return { store: "local_file", logRef: relPath };
    },

    async append(handle, event) {
      if (handle.store !== "local_file") return;
      const absPath = resolveWithin(basePath, handle.logRef);
      const line = JSON.stringify({
        ts: event.ts,
        stream: event.stream,
        chunk: event.chunk,
      });
      await new Promise<void>((resolve, reject) => {
        const stream = createWriteStream(absPath, { flags: "a", encoding: "utf8" });
        stream.on("error", reject);
        stream.end(`${line}\n`, () => resolve());
      });
    },

    async finalize(handle) {
      if (handle.store !== "local_file") {
        return { bytes: 0, compressed: false };
      }
      const absPath = resolveWithin(basePath, handle.logRef);
      const stat = await fs.stat(absPath).catch(() => null);
      if (!stat) throw notFound("Run log not found");

      const hash = await sha256File(absPath);
      return {
        bytes: stat.size,
        sha256: hash,
        compressed: false,
      };
    },

    async read(handle, opts) {
      if (handle.store !== "local_file") {
        throw notFound("Run log not found");
      }
      const absPath = resolveWithin(basePath, handle.logRef);
      const offset = opts?.offset ?? 0;
      const limitBytes = opts?.limitBytes ?? 256_000;
      return readFileRange(absPath, offset, limitBytes);
    },
  };
}

// ---------------------------------------------------------------------------
// Object store backend (R2 / S3)
// ---------------------------------------------------------------------------

const RUN_LOG_NAMESPACE = "run-logs";

function createObjectStoreRunLogStore(storage: StorageService): RunLogStore {
  // During execution we buffer to a local temp file (append is called per-line).
  // On finalize we upload the complete file to object storage and remove the temp.
  // Reads always go to object storage.

  async function sha256File(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk: string | Buffer) => hash.update(typeof chunk === "string" ? chunk : new Uint8Array(chunk)));
      stream.on("error", reject);
      stream.on("end", () => resolve(hash.digest("hex")));
    });
  }

  return {
    async begin(input) {
      const [safeAgent] = safeSegments(input.agentId);
      const [safeRun] = safeSegments(input.runId);
      // logRef is the agent-scoped path within {companyId}/run-logs/
      const logRef = `${safeAgent}/${safeRun}.ndjson`;

      // Create a temp file for streaming appends
      const tmpDir = path.join(os.tmpdir(), "substaff-run-logs");
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `${safeRun}.ndjson`);
      await fs.writeFile(tmpFile, "", "utf8");

      return {
        store: "object_store" as RunLogStoreType,
        logRef,
        _tempPath: tmpFile,
        _companyId: input.companyId,
      };
    },

    async append(handle, event) {
      if (handle.store !== "object_store") return;
      const tmpFile = handle._tempPath;
      if (!tmpFile) return;

      const line = JSON.stringify({
        ts: event.ts,
        stream: event.stream,
        chunk: event.chunk,
      });
      await new Promise<void>((resolve, reject) => {
        const stream = createWriteStream(tmpFile, { flags: "a", encoding: "utf8" });
        stream.on("error", reject);
        stream.end(`${line}\n`, () => resolve());
      });
    },

    async finalize(handle) {
      if (handle.store !== "object_store") {
        return { bytes: 0, compressed: false };
      }
      const tmpFile = handle._tempPath;
      const companyId = handle._companyId;
      if (!tmpFile || !companyId) {
        return { bytes: 0, compressed: false };
      }

      const stat = await fs.stat(tmpFile).catch(() => null);
      if (!stat) throw notFound("Run log not found");

      const hash = await sha256File(tmpFile);
      const body = await fs.readFile(tmpFile);

      // Upload to object storage using putFileExact for a deterministic key.
      // logRef is "{agentId}/{runId}.ndjson", putFileExact builds: {companyId}/run-logs/{logRef}
      await storage.putFileExact({
        companyId,
        namespace: RUN_LOG_NAMESPACE,
        originalFilename: handle.logRef,
        contentType: "application/x-ndjson",
        body,
      });

      // Clean up temp file
      await fs.unlink(tmpFile).catch(() => {});

      return {
        bytes: stat.size,
        sha256: hash,
        compressed: false,
      };
    },

    async read(_handle, _opts) {
      // Object store reads require companyId which isn't in the handle.
      // Use readRunLogFromObjectStore() directly instead (called by heartbeat.readLog).
      throw notFound("Run log not found");
    },
  };
}

// ---------------------------------------------------------------------------
// Extended read function for object store (needs companyId from caller)
// ---------------------------------------------------------------------------

export async function readRunLogFromObjectStore(
  storage: StorageService,
  companyId: string,
  logRef: string,
  opts?: RunLogReadOptions,
): Promise<RunLogReadResult> {
  const offset = opts?.offset ?? 0;
  const limitBytes = opts?.limitBytes ?? 256_000;

  // Full object key: {companyId}/run-logs/{logRef}
  const objectKey = `${companyId}/${RUN_LOG_NAMESPACE}/${logRef}`;

  try {
    const result = await storage.getObject(companyId, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fullContent = Buffer.concat(chunks as Uint8Array[]);

    const totalSize = fullContent.length;
    const start = Math.max(0, Math.min(offset, totalSize));
    const end = Math.min(start + limitBytes, totalSize);

    if (start >= end) {
      return { content: "", nextOffset: start };
    }

    const content = fullContent.subarray(start, end).toString("utf8");
    const nextOffset = end < totalSize ? end : undefined;
    return { content, nextOffset };
  } catch (err) {
    const code = (err as { status?: number }).status;
    if (code === 404) throw notFound("Run log not found");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cachedStore: RunLogStore | null = null;
let cachedStoreType: RunLogStoreType | null = null;

export function getRunLogStoreType(): RunLogStoreType {
  const explicit = process.env.RUN_LOG_STORE;
  if (explicit === "object_store") return "object_store";
  if (explicit === "local_file") return "local_file";
  // Auto-detect: use object_store when S3/R2 storage is configured
  if (process.env.SUBSTAFF_STORAGE_S3_BUCKET) return "object_store";
  return "local_file";
}

export function getRunLogStore(): RunLogStore {
  const storeType = getRunLogStoreType();
  if (cachedStore && cachedStoreType === storeType) return cachedStore;

  if (storeType === "object_store") {
    const storage = getStorageService();
    cachedStore = createObjectStoreRunLogStore(storage);
  } else {
    const basePath = process.env.RUN_LOG_BASE_PATH ?? path.resolve(process.cwd(), "data/run-logs");
    cachedStore = createLocalFileRunLogStore(basePath);
  }
  cachedStoreType = storeType;
  return cachedStore;
}
