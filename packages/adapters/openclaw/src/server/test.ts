import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@substaff/adapter-utils";
import { asString } from "@substaff/adapter-utils/server-utils";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];

  const url = asString(ctx.config?.url, "").trim();
  if (!url) {
    checks.push({
      code: "openclaw_url_missing",
      level: "error",
      message:
        "OpenClaw webhook URL is not configured. Set the 'url' field in the agent's adapter config.",
      hint: "In the Substaff UI, edit the agent and set a webhook URL, or use `pnpm substaff agent update` from the CLI.",
    });
  } else {
    checks.push({
      code: "openclaw_url_present",
      level: "info",
      message: `OpenClaw webhook URL is configured: ${url}`,
    });

    // Attempt a lightweight connectivity check (HEAD or OPTIONS)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
        });
        checks.push({
          code: "openclaw_url_reachable",
          level: "info",
          message: `OpenClaw endpoint responded with status ${res.status}`,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.push({
        code: "openclaw_url_unreachable",
        level: "warn",
        message: `Could not reach OpenClaw endpoint: ${message}`,
        hint: "Ensure the URL is reachable from the Substaff server.",
      });
    }
  }

  const hasErrors = checks.some((c) => c.level === "error");
  const hasWarnings = checks.some((c) => c.level === "warn");

  return {
    adapterType: "openclaw",
    status: hasErrors ? "fail" : hasWarnings ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
