import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@substaff/adapter-utils";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];

  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    checks.push({
      code: "e2b_api_key_missing",
      level: "error",
      message: "E2B_API_KEY environment variable is not set",
      hint: "Set E2B_API_KEY to your E2B API key",
    });
  } else {
    checks.push({
      code: "e2b_api_key_present",
      level: "info",
      message: "E2B_API_KEY is configured",
    });
  }

  const hasErrors = checks.some((c) => c.level === "error");
  const hasWarnings = checks.some((c) => c.level === "warn");

  return {
    adapterType: "e2b_sandbox",
    status: hasErrors ? "fail" : hasWarnings ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
