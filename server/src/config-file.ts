import fs from "node:fs";
import { substaffConfigSchema, type SubstaffConfig } from "@substaff/shared";
import { resolveSubstaffConfigPath } from "./paths.js";

export function readConfigFile(): SubstaffConfig | null {
  const configPath = resolveSubstaffConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return substaffConfigSchema.parse(raw);
  } catch {
    return null;
  }
}
