import { Router } from "express";
import type { Db } from "@substaff/db";
import type { DeploymentMode } from "@substaff/shared";

export function healthRoutes(
  db?: Db,
  opts: {
    deploymentMode: DeploymentMode;
    authReady: boolean;
    companyDeletionEnabled: boolean;
  } = {
    deploymentMode: "authenticated",
    authReady: true,
    companyDeletionEnabled: false,
  },
) {
  const router = Router();

  router.get("/", async (_req, res) => {
    if (!db) {
      res.json({ status: "ok" });
      return;
    }

    res.json({
      status: "ok",
      deploymentMode: opts.deploymentMode,
      authReady: opts.authReady,
      bootstrapStatus: "ready",
      features: {
        companyDeletionEnabled: opts.companyDeletionEnabled,
      },
    });
  });

  return router;
}
