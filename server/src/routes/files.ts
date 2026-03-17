import archiver from "archiver";
import type { StorageService } from "../storage/types.js";
import type { Db } from "@substaff/db";
import { assets, assetLinks } from "@substaff/db";
import { eq, and } from "drizzle-orm";
import { linkAssetSchema } from "@substaff/shared";
import { assertBoard, companyRouter, getActorInfo } from "./authz.js";
import { badRequest, forbidden } from "../errors.js";
import { logActivity } from "../services/index.js";

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

export function fileRoutes(storage: StorageService, db: Db) {
  const router = companyRouter();

  // =========================================================================
  // Board (UI) endpoints — full company-wide file access
  // =========================================================================

  // List files/folders at a given prefix
  router.get("/companies/:companyId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
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
  // Board (UI) file upload — write a file from the dashboard
  // =========================================================================

  router.put("/companies/:companyId/files/content/*filePath", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);

    const rawPath = req.params.filePath;
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath);
    if (!filePath || filePath.includes("..")) {
      throw badRequest("Invalid file path");
    }

    // Resolve body — express.json() may have already parsed JSON requests,
    // consuming the stream. Check req.body first, then fall back to streaming.
    let body: Buffer;
    let contentType = (req.headers["content-type"] as string) || "application/octet-stream";

    if (req.body && typeof req.body === "object" && req.body.content) {
      const encoding = req.body.encoding === "base64" ? "base64" : "utf-8";
      body = Buffer.from(req.body.content, encoding);
      const ext = filePath.split(".").pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        md: "text/markdown", txt: "text/plain", json: "application/json",
        js: "text/javascript", ts: "text/typescript", py: "text/x-python",
        cs: "text/x-csharp", yaml: "text/yaml", yml: "text/yaml",
        html: "text/html", css: "text/css", xml: "application/xml",
      };
      contentType = (ext && mimeMap[ext]) || "application/octet-stream";
    } else {
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
      body = Buffer.concat(chunks);
    }

    if (body.length === 0) {
      throw badRequest("Empty file body");
    }

    // Determine namespace from the file path (first segment, e.g. "workspace")
    const pathParts = filePath.split("/");
    const namespace = pathParts.length > 1 ? pathParts[0] : "workspace";
    const relativePath = pathParts.length > 1 ? pathParts.slice(1).join("/") : filePath;

    const result = await storage.putFileExact({
      companyId,
      namespace,
      originalFilename: relativePath,
      contentType,
      body,
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "file.uploaded",
      entityType: "file",
      entityId: result.objectKey,
      details: {
        objectKey: result.objectKey,
        contentType: result.contentType,
        byteSize: result.byteSize,
      },
    });

    res.status(201).json({
      objectKey: result.objectKey,
      size: result.byteSize,
    });
  });

  // Delete a file from the board
  router.delete("/companies/:companyId/files/content/*filePath", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);

    const rawPath = req.params.filePath;
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath);
    if (!filePath || filePath.includes("..")) {
      throw badRequest("Invalid file path");
    }

    const objectKey = `${companyId}/${filePath}`;
    await storage.deleteObject(companyId, objectKey);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "file.deleted",
      entityType: "file",
      entityId: objectKey,
      details: { objectKey },
    });

    res.status(204).end();
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
  // Supports optional ?linkTo=issue:<id> or ?linkTo=project:<id> or ?linkTo=goal:<id>
  // to create an asset record and link it to an entity.
  //
  // Accepts two formats:
  //   1. Raw binary body (any Content-Type) — stored as-is
  //   2. JSON body: { "content": "<base64>", "encoding": "base64" }
  router.put("/agent/files/content/*filePath", async (req, res) => {
    const { companyId, agentId, prefix } = agentNamespace(req);

    const rawPath = req.params.filePath;
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : String(rawPath);
    if (!filePath || filePath.includes("..")) {
      throw badRequest("Invalid file path");
    }

    // Resolve body — express.json() may have already parsed JSON requests,
    // consuming the stream. Check req.body first, then fall back to streaming.
    let body: Buffer;
    let contentType = (req.headers["content-type"] as string) || "application/octet-stream";

    if (req.body && typeof req.body === "object" && req.body.content) {
      // JSON body with base64 content: { "content": "...", "encoding": "base64" }
      const encoding = req.body.encoding === "base64" ? "base64" : "utf-8";
      body = Buffer.from(req.body.content, encoding);
      // Store as the inferred type, not application/json
      const ext = filePath.split(".").pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        md: "text/markdown", txt: "text/plain", json: "application/json",
        js: "text/javascript", ts: "text/typescript", py: "text/x-python",
        cs: "text/x-csharp", yaml: "text/yaml", yml: "text/yaml",
        html: "text/html", css: "text/css", xml: "application/xml",
      };
      contentType = (ext && mimeMap[ext]) || "application/octet-stream";
    } else {
      // Raw body — read from stream (works when express.json() didn't match)
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
      body = Buffer.concat(chunks);
    }

    if (body.length === 0) {
      throw badRequest("Empty file body");
    }

    const result = await storage.putFileExact({
      companyId,
      namespace: prefix,
      originalFilename: filePath,
      contentType,
      body,
    });

    const actor = getActorInfo(req);

    // Parse optional linkTo query param (e.g. "issue:uuid" or "project:uuid" or "goal:uuid")
    const linkToRaw = req.query.linkTo as string | undefined;
    let linkInfo: { linkType: string; linkId: string } | null = null;

    if (linkToRaw) {
      const [type, id] = linkToRaw.split(":");
      const parsed = linkAssetSchema.safeParse({ linkType: type, linkId: id });
      if (!parsed.success) {
        throw badRequest(`Invalid linkTo format. Expected "issue:<uuid>" or "project:<uuid>" or "goal:<uuid>"`);
      }
      linkInfo = parsed.data;

      // Upsert asset record for this file
      const existing = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.companyId, companyId), eq(assets.objectKey, result.objectKey)))
        .then((rows) => rows[0] ?? null);

      let assetId: string;
      if (existing) {
        await db
          .update(assets)
          .set({
            contentType: result.contentType,
            byteSize: result.byteSize,
            sha256: result.sha256,
            originalFilename: result.originalFilename,
            updatedAt: new Date(),
          })
          .where(eq(assets.id, existing.id));
        assetId = existing.id;
      } else {
        const [asset] = await db
          .insert(assets)
          .values({
            companyId,
            provider: result.provider,
            objectKey: result.objectKey,
            contentType: result.contentType,
            byteSize: result.byteSize,
            sha256: result.sha256,
            originalFilename: result.originalFilename,
            createdByAgentId: agentId,
          })
          .returning();
        assetId = asset.id;
      }

      // Upsert the link (avoid duplicates)
      const existingLink = await db
        .select({ id: assetLinks.id })
        .from(assetLinks)
        .where(
          and(
            eq(assetLinks.assetId, assetId),
            eq(assetLinks.linkType, linkInfo.linkType),
            eq(assetLinks.linkId, linkInfo.linkId),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!existingLink) {
        await db
          .insert(assetLinks)
          .values({
            companyId,
            assetId,
            linkType: linkInfo.linkType,
            linkId: linkInfo.linkId,
          });
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: linkInfo ? "file.uploaded_and_linked" : "file.uploaded",
      entityType: linkInfo?.linkType ?? "file",
      entityId: linkInfo?.linkId ?? result.objectKey,
      details: {
        objectKey: result.objectKey,
        contentType: result.contentType,
        byteSize: result.byteSize,
        ...(linkInfo ? { linkType: linkInfo.linkType, linkId: linkInfo.linkId } : {}),
      },
    });

    res.status(201).json({
      objectKey: result.objectKey,
      size: result.byteSize,
      ...(linkInfo ? { linked: { linkType: linkInfo.linkType, linkId: linkInfo.linkId } } : {}),
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

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "file.deleted",
      entityType: "file",
      entityId: objectKey,
      details: { objectKey },
    });

    res.status(204).end();
  });

  return router;
}
