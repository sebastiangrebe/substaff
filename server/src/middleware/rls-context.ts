import type { RequestHandler } from "express";
import type { Db } from "@substaff/db";
import { sql } from "drizzle-orm";

/**
 * Sets PostgreSQL session variables for Row-Level Security (RLS) policies.
 *
 * Must run AFTER actorMiddleware (which populates req.actor).
 * Sets vendor/company IDs so RLS policies can filter rows per-tenant.
 *
 * There is no bypass mechanism — even admins get their full vendor/company
 * list set explicitly. The auth middleware is responsible for expanding
 * companyIds for vendor owners to include all companies under their vendors.
 */
export function rlsContextMiddleware(db: Db): RequestHandler {
  return async (req, _res, next) => {
    const actor = req.actor;

    let vendorIds = "";
    let companyIds = "";

    if (actor.type === "board") {
      vendorIds = (actor.vendorIds ?? []).join(",");
      companyIds = (actor.companyIds ?? []).join(",");
    } else if (actor.type === "agent") {
      if (actor.vendorId) vendorIds = actor.vendorId;
      if (actor.companyId) companyIds = actor.companyId;
    }
    // Unauthenticated actors get empty strings — RLS blocks all rows.

    try {
      await db.execute(
        sql`SELECT set_config('app.current_vendor_ids', ${vendorIds}, false),
               set_config('app.current_company_ids', ${companyIds}, false)`
      );
    } catch {
      // If the session variable functions don't exist yet (migration not applied),
      // silently continue — application-layer checks still protect data.
    }

    next();
  };
}
