import { Router } from "express";
import archiver from "archiver";
import type { StorageService } from "../storage/types.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { badRequest, forbidden } from "../errors.js";

const MAX_AGENT_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file

/**
 * Resolve the agent's storage namespace.
 * All agents in a company share the same workspace namespace so files created
 * by one agent (e.g. CEO setting up persona files) are visible to others.
 */
function agentNamespace(req: Express.Request): { companyId: string; agentId: string; prefix: string } {
  if (req.actor.type !== "agent" || !req.actor.agentId || !req.actor.companyId) {
    throw forbidden("Agent authentication required");
  }
  return {
    companyId: req.actor.companyId,
    agentId: req.actor.agentId,
    prefix: "workspace",
  };
}

export function fileRoutes(storage: StorageService) {
  const router = Router();

  // =========================================================================
  // Board (UI) endpoints — full company-wide file access
  // =========================================================================

  // List files/folders at a given prefix
  router.get("/companies/:companyId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const prefix = (req.query.prefix as string) ?? "";
    if (prefix.includes("..")) {
      throw badRequest("Invalid prefix");
    }

    const result = await storage.listObjects(companyId, prefix);

    // Strip the companyId prefix from keys for cleaner client-side display
    const companyPrefix = `${companyId}/`;
    const files = result.objects.map((obj) => ({
      key: obj.key.startsWith(companyPrefix) ? obj.key.slice(companyPrefix.length) : obj.key,
      size: obj.size,
      lastModified: obj.lastModified,
      isFolder: false,
    }));

    const folders = result.commonPrefixes.map((cp) => ({
      key: cp.startsWith(companyPrefix) ? cp.slice(companyPrefix.length) : cp,
      size: 0,
      lastModified: null,
      isFolder: true,
    }));

    res.json([...folders, ...files]);
  });

  // Get/download a specific file
  router.get("/companies/:companyId/files/content/*filePath", async (req, res, next) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    // Express 5 wildcard params return string[]
    const rawPath = req.params.filePath;
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath);
    if (!filePath || filePath.includes("..")) {
      throw badRequest("Invalid file path");
    }

    const objectKey = `${companyId}/${filePath}`;
    const object = await storage.getObject(companyId, objectKey);

    res.setHeader(
      "Content-Type",
      object.contentType || "application/octet-stream",
    );
    if (object.contentLength) {
      res.setHeader("Content-Length", String(object.contentLength));
    }
    res.setHeader("Cache-Control", "private, max-age=60");

    object.stream.on("error", (err) => {
      next(err);
    });
    object.stream.pipe(res);
  });

  // Download a folder as a zip archive
  router.get("/companies/:companyId/files/download-zip", async (req, res, next) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const prefix = (req.query.prefix as string) ?? "";
    if (prefix.includes("..")) {
      throw badRequest("Invalid prefix");
    }

    // List all files recursively under the prefix
    const result = await storage.listObjects(companyId, prefix, { recursive: true });
    if (result.objects.length === 0) {
      throw badRequest("No files to download");
    }

    // Determine the zip filename from the prefix
    const folderName = prefix
      ? prefix.replace(/\/+$/, "").split("/").pop() || "files"
      : "files";

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${folderName}.zip"`);

    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", (err) => next(err));
    archive.pipe(res);

    const companyPrefix = `${companyId}/`;
    const basePrefix = prefix ? `${companyId}/${prefix}` : `${companyId}/`;

    for (const obj of result.objects) {
      // Compute the path inside the zip relative to the requested prefix
      const fullKey = obj.key.startsWith(companyPrefix) ? obj.key : `${companyPrefix}${obj.key}`;
      const relativePath = fullKey.startsWith(basePrefix)
        ? fullKey.slice(basePrefix.length)
        : obj.key;

      if (!relativePath) continue;

      try {
        const object = await storage.getObject(companyId, obj.key);
        archive.append(object.stream, { name: relativePath });
      } catch {
        // Skip files that fail to download
      }
    }

    await archive.finalize();
  });

  // =========================================================================
  // Agent endpoints — scoped to workspace/ (shared across all agents in the company)
  // Agents authenticate via SUBSTAFF_API_KEY (bearer token).
  // =========================================================================

  // List files in the agent's workspace
  router.get("/agent/files", async (req, res) => {
    const { companyId, prefix } = agentNamespace(req);
    const subPrefix = (req.query.prefix as string) ?? "";
    if (subPrefix.includes("..")) {
      throw badRequest("Invalid prefix");
    }

    const fullPrefix = subPrefix ? `${prefix}/${subPrefix}` : `${prefix}/`;
    const result = await storage.listObjects(companyId, fullPrefix);

    // Strip the agent namespace prefix so paths are relative to the workspace root
    const nsPrefix = `${prefix}/`;
    const files = result.objects.map((obj) => ({
      key: obj.key.startsWith(nsPrefix) ? obj.key.slice(nsPrefix.length) : obj.key,
      size: obj.size,
      lastModified: obj.lastModified,
    }));

    const folders = result.commonPrefixes.map((cp) => ({
      key: cp.startsWith(nsPrefix) ? cp.slice(nsPrefix.length) : cp,
    }));

    res.json({ files, folders });
  });

  // Read a file from the agent's workspace
  router.get("/agent/files/content/*filePath", async (req, res, next) => {
    const { companyId, prefix } = agentNamespace(req);

    const rawPath = req.params.filePath;
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath);
    if (!filePath || filePath.includes("..")) {
      throw badRequest("Invalid file path");
    }

    const objectKey = `${companyId}/${prefix}/${filePath}`;
    const object = await storage.getObject(companyId, objectKey);

    res.setHeader("Content-Type", object.contentType || "application/octet-stream");
    if (object.contentLength) {
      res.setHeader("Content-Length", String(object.contentLength));
    }

    object.stream.on("error", (err) => next(err));
    object.stream.pipe(res);
  });

  // Write a file to the agent's workspace
  router.put("/agent/files/content/*filePath", async (req, res) => {
    const { companyId, prefix } = agentNamespace(req);

    const rawPath = req.params.filePath;
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath);
    if (!filePath || filePath.includes("..")) {
      throw badRequest("Invalid file path");
    }

    // Collect the request body as a buffer
    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += buf.length;
      if (totalSize > MAX_AGENT_UPLOAD_BYTES) {
        throw badRequest(`File too large (max ${MAX_AGENT_UPLOAD_BYTES / (1024 * 1024)} MB)`);
      }
      chunks.push(buf);
    }

    const body = Buffer.concat(chunks);
    if (body.length === 0) {
      throw badRequest("Empty file body");
    }

    const contentType = (req.headers["content-type"] as string) || "application/octet-stream";

    const result = await storage.putFileExact({
      companyId,
      namespace: prefix,
      originalFilename: filePath,
      contentType,
      body,
    });

    res.status(201).json({
      objectKey: result.objectKey,
      size: result.byteSize,
    });
  });

  // Delete a file from the agent's workspace
  router.delete("/agent/files/content/*filePath", async (req, res) => {
    const { companyId, prefix } = agentNamespace(req);

    const rawPath = req.params.filePath;
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath);
    if (!filePath || filePath.includes("..")) {
      throw badRequest("Invalid file path");
    }

    const objectKey = `${companyId}/${prefix}/${filePath}`;
    await storage.deleteObject(companyId, objectKey);
    res.status(204).end();
  });

  return router;
}
