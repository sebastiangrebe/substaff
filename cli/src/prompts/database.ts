import * as p from "@clack/prompts";
import type { DatabaseConfig } from "../config/schema.js";

export async function promptDatabase(current?: DatabaseConfig): Promise<DatabaseConfig> {
  const value = await p.text({
    message: "PostgreSQL connection string",
    defaultValue: current?.connectionString ?? "",
    placeholder: "postgres://user:pass@localhost:5432/substaff",
    validate: (val) => {
      if (!val) return "Connection string is required";
      if (!val.startsWith("postgres")) return "Must be a postgres:// or postgresql:// URL";
    },
  });

  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  return { connectionString: value };
}
