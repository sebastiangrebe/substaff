import { Router, type Request, type Response } from "express";
import multer from "multer";
import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { authUsers } from "@substaff/db";
import type { StorageService } from "../storage/types.js";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const EXT_MAP: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Synthetic companyId used as the storage namespace for user avatars. */
const AVATAR_COMPANY_ID = "__users__";

export function avatarRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  });

  function runSingleFileUpload(req: Request, res: Response) {
    return new Promise<void>((resolve, reject) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Upload avatar for the authenticated user
  router.post("/auth/avatar", async (req, res) => {
    const userId = req.actor?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      await runSingleFileUpload(req, res);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ error: `Avatar exceeds ${MAX_AVATAR_BYTES} bytes` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const file = (req as Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }

    const contentType = (file.mimetype || "").toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      res.status(422).json({ error: `Unsupported image type: ${contentType || "unknown"}` });
      return;
    }
    if (file.buffer.length <= 0) {
      res.status(422).json({ error: "Image is empty" });
      return;
    }

    const ext = EXT_MAP[contentType] ?? ".png";
    await storage.putFileExact({
      companyId: AVATAR_COMPANY_ID,
      namespace: "avatars",
      originalFilename: `${userId}${ext}`,
      contentType,
      body: file.buffer,
    });

    const imagePath = `/api/auth/avatar/${userId}`;
    await db
      .update(authUsers)
      .set({ image: imagePath, updatedAt: new Date() })
      .where(eq(authUsers.id, userId));

    res.json({ image: imagePath });
  });

  // Serve avatar for a user
  router.get("/auth/avatar/:userId", async (req, res, next) => {
    const userId = req.params.userId as string;

    const user = await db
      .select({ image: authUsers.image })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);

    if (!user?.image) {
      res.status(404).json({ error: "No avatar" });
      return;
    }

    // Find the avatar file in storage by trying known extensions
    for (const ext of [".png", ".jpg", ".webp", ".gif"]) {
      const objectKey = `${AVATAR_COMPANY_ID}/avatars/${userId}${ext}`;
      try {
        const head = await storage.headObject(AVATAR_COMPANY_ID, objectKey);
        if (head.exists) {
          const object = await storage.getObject(AVATAR_COMPANY_ID, objectKey);
          res.setHeader("Content-Type", object.contentType || "image/png");
          if (object.contentLength) res.setHeader("Content-Length", String(object.contentLength));
          res.setHeader("Cache-Control", "public, max-age=300");
          object.stream.on("error", (err) => next(err));
          object.stream.pipe(res);
          return;
        }
      } catch {
        // Try next extension
      }
    }

    res.status(404).json({ error: "Avatar file not found" });
  });

  // Delete avatar for the authenticated user
  router.delete("/auth/avatar", async (req, res) => {
    const userId = req.actor?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Clear the image from the user record
    await db
      .update(authUsers)
      .set({ image: null, updatedAt: new Date() })
      .where(eq(authUsers.id, userId));

    // Try to delete avatar files from storage (best effort)
    for (const ext of [".png", ".jpg", ".webp", ".gif"]) {
      const objectKey = `${AVATAR_COMPANY_ID}/avatars/${userId}${ext}`;
      try {
        await storage.deleteObject(AVATAR_COMPANY_ID, objectKey);
      } catch {
        // Ignore — file may not exist for this extension
      }
    }

    res.json({ ok: true });
  });

  return router;
}
