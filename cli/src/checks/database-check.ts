import type { SubstaffConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

export async function databaseCheck(config: SubstaffConfig, configPath?: string): Promise<CheckResult> {
  if (!config.database.connectionString) {
    return {
      name: "Database",
      status: "fail",
      message: "No connection string configured",
      canRepair: false,
      repairHint: "Run `substaff configure --section database`",
    };
  }

  try {
    const { createDb } = await import("@substaff/db");
    const db = createDb(config.database.connectionString);
    await db.execute("SELECT 1");
    return {
      name: "Database",
      status: "pass",
      message: "PostgreSQL connection successful",
    };
  } catch (err) {
    return {
      name: "Database",
      status: "fail",
      message: `Cannot connect to PostgreSQL: ${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "Check your connection string and ensure PostgreSQL is running",
    };
  }
}
