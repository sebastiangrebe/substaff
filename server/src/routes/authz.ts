import { Router, type Request, type RequestHandler } from "express";
import { forbidden, unauthorized } from "../errors.js";

export function assertBoard(req: Request) {
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
}

export function assertCompanyAccess(req: Request, companyId: string) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent" && req.actor.companyId !== companyId) {
    throw forbidden("Agent key cannot access another company");
  }
  if (req.actor.type === "board") {
    const allowedCompanies = req.actor.companyIds ?? [];
    if (!allowedCompanies.includes(companyId)) {
      throw forbidden("User does not have access to this company");
    }
  }
}

export function assertVendorAccess(req: Request, vendorId: string) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent") {
    if (req.actor.vendorId !== vendorId) {
      throw forbidden("Agent cannot access another vendor's resources");
    }
    return;
  }
  if (req.actor.type === "board") {
    const allowedVendors = req.actor.vendorIds ?? [];
    if (!allowedVendors.includes(vendorId)) {
      throw forbidden("User does not have access to this vendor");
    }
  }
}

export function getActorVendorId(req: Request): string {
  if (req.actor.type === "agent") {
    if (!req.actor.vendorId) throw forbidden("No vendor context for agent");
    return req.actor.vendorId;
  }
  if (req.actor.type === "board") {
    const vendorId = req.actor.vendorIds?.[0];
    if (!vendorId) throw forbidden("No vendor context for user");
    return vendorId;
  }
  throw unauthorized();
}

/**
 * Create a Router with company access control automatically enforced
 * for any route containing a :companyId parameter. Use this instead of
 * plain Router() in route files with company-scoped endpoints.
 *
 * Routes that resolve companyId from a resource (e.g. /agents/:id) still
 * need to call assertCompanyAccess manually after loading the resource.
 */
export function companyRouter(): ReturnType<typeof Router> {
  const router = Router();
  router.param("companyId", (req, _res, next, companyId: string) => {
    assertCompanyAccess(req, companyId);
    next();
  });
  return router;
}

export function getActorInfo(req: Request) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent") {
    return {
      actorType: "agent" as const,
      actorId: req.actor.agentId ?? "unknown-agent",
      agentId: req.actor.agentId ?? null,
      runId: req.actor.runId ?? null,
    };
  }

  return {
    actorType: "user" as const,
    actorId: req.actor.userId ?? "board",
    agentId: null,
    runId: req.actor.runId ?? null,
  };
}
