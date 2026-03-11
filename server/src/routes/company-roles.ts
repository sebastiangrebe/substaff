import type { Db } from "@substaff/db";
import { createCompanyRoleSchema, updateCompanyRoleSchema } from "@substaff/shared";
import { validate } from "../middleware/validate.js";
import { companyRoleService } from "../services/company-roles.js";
import { companyRouter } from "./authz.js";

export function companyRoleRoutes(db: Db) {
  const router = companyRouter();
  const svc = companyRoleService(db);

  // List all roles (built-in + custom) for a company
  router.get("/companies/:companyId/roles", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roles = await svc.list(companyId);
    res.json(roles);
  });

  // Create a custom role
  router.post("/companies/:companyId/roles", validate(createCompanyRoleSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const role = await svc.create(companyId, req.body);
    res.status(201).json(role);
  });

  // Update a custom role
  router.patch("/companies/:companyId/roles/:roleId", validate(updateCompanyRoleSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const role = await svc.update(req.params.roleId as string, req.body);
    res.json(role);
  });

  // Delete a custom role
  router.delete("/companies/:companyId/roles/:roleId", async (req, res) => {
    const companyId = req.params.companyId as string;
    await svc.remove(req.params.roleId as string);
    res.json({ ok: true });
  });

  return router;
}
