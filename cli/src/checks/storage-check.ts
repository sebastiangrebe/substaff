import type { SubstaffConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

export function storageCheck(config: SubstaffConfig, _configPath?: string): CheckResult {
  const bucket = config.storage.s3.bucket.trim();
  const region = config.storage.s3.region.trim();
  if (!bucket || !region) {
    return {
      name: "Storage",
      status: "fail",
      message: "S3 storage requires non-empty bucket and region",
      canRepair: false,
      repairHint: "Run `substaff configure --section storage`",
    };
  }

  return {
    name: "Storage",
    status: "warn",
    message: `S3 storage configured (bucket=${bucket}, region=${region}). Reachability check is skipped in doctor.`,
    canRepair: false,
    repairHint: "Verify credentials and endpoint in deployment environment",
  };
}
