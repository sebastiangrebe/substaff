import type { Db } from "@substaff/db";
import { dashboardService } from "../services/dashboard.js";
import { companyRouter } from "./authz.js";

export function dashboardRoutes(db: Db) {
  const router = companyRouter();
  const svc = dashboardService(db);

  router.get("/companies/:companyId/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    const summary = await svc.summary(companyId);
    res.json(summary);
  });

  return router;
}
