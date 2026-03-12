import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@substaff/adapter-utils";

export async function testEnvironment(
  _ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];

  const apiKey = process.env.BL_API_KEY;
  if (!apiKey) {
    checks.push({
      code: "bl_api_key_missing",
      level: "error",
      message: "BL_API_KEY environment variable is not set",
      hint: "Set BL_API_KEY to your Blaxel API key",
    });
  } else {
    checks.push({
      code: "bl_api_key_present",
      level: "info",
      message: "BL_API_KEY is configured",
    });
  }

  const workspace = process.env.BL_WORKSPACE;
  if (!workspace) {
    checks.push({
      code: "bl_workspace_missing",
      level: "error",
      message: "BL_WORKSPACE environment variable is not set",
      hint: "Set BL_WORKSPACE to your Blaxel workspace name",
    });
  } else {
    checks.push({
      code: "bl_workspace_present",
      level: "info",
      message: "BL_WORKSPACE is configured",
    });
  }

  const hasErrors = checks.some((c) => c.level === "error");
  const hasWarnings = checks.some((c) => c.level === "warn");

  return {
    adapterType: "blaxel_sandbox",
    status: hasErrors ? "fail" : hasWarnings ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
