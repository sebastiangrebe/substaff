import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

/**
 * Sets RLS session variables on the current database connection.
 * Call this before executing queries that need tenant-scoped access.
 *
 * There is no bypass mechanism — all access must go through proper
 * vendor/company scoping, including background services.
 */
export async function setRlsContext(
  db: Db,
  ctx: {
    vendorIds?: string[];
    companyIds?: string[];
  },
): Promise<void> {
  const vendorIds = (ctx.vendorIds ?? []).join(",");
  const companyIds = (ctx.companyIds ?? []).join(",");

  await db.execute(
    sql`SELECT set_config('app.current_vendor_ids', ${vendorIds}, false),
           set_config('app.current_company_ids', ${companyIds}, false)`,
  );
}

/**
 * Loads ALL vendor and company IDs into the RLS context.
 * Use for background services (heartbeat, migrations) that need
 * cross-tenant access. This is safe because it explicitly enumerates
 * all IDs rather than bypassing policy checks.
 */
export async function setRlsAllTenantsContext(db: Db): Promise<void> {
  // Query all vendor IDs and company IDs, then set them as the context.
  // This still goes through RLS policies — the policies just see all IDs.
  const [vendorRows, companyRows] = await Promise.all([
    db.execute(sql`SELECT id FROM vendors`),
    db.execute(sql`SELECT id FROM companies`),
  ]);

  const vendorIds = (vendorRows as unknown as Array<{ id: string }>).map((r) => r.id);
  const companyIds = (companyRows as unknown as Array<{ id: string }>).map((r) => r.id);

  await setRlsContext(db, { vendorIds, companyIds });
}
