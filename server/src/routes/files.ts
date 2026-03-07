import { Router } from "express";
import type { StorageService } from "../storage/types.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";

export function fileRoutes(storage: StorageService) {
  const router = Router();

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

  return router;
}
