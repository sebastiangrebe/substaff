import * as p from "@clack/prompts";
import type { AuthConfig, ServerConfig } from "../config/schema.js";

export async function promptServer(opts?: {
  currentServer?: Partial<ServerConfig>;
  currentAuth?: Partial<AuthConfig>;
}): Promise<{ server: ServerConfig; auth: AuthConfig }> {
  const currentServer = opts?.currentServer;
  const currentAuth = opts?.currentAuth;

  const deploymentMode: ServerConfig["deploymentMode"] = "authenticated";
  p.log.info("Deployment mode: authenticated (login required)");

  const hostDefault = "0.0.0.0";
  const hostStr = await p.text({
    message: "Bind host",
    defaultValue: currentServer?.host ?? hostDefault,
    placeholder: hostDefault,
    validate: (val) => {
      if (!val.trim()) return "Host is required";
    },
  });

  if (p.isCancel(hostStr)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const portStr = await p.text({
    message: "Server port",
    defaultValue: String(currentServer?.port ?? 3100),
    placeholder: "3100",
    validate: (val) => {
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 65535 || !Number.isInteger(n)) {
        return "Must be an integer between 1 and 65535";
      }
    },
  });

  if (p.isCancel(portStr)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const port = Number(portStr) || 3100;
  let auth: AuthConfig = {};
  if (currentAuth?.publicBaseUrl) {
    const urlInput = await p.text({
      message: "Public base URL (optional)",
      defaultValue: currentAuth.publicBaseUrl ?? "",
      placeholder: "https://substaff.example.com",
      validate: (val) => {
        const candidate = val.trim();
        if (!candidate) return;
        try {
          const url = new URL(candidate);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "URL must start with http:// or https://";
          }
          return;
        } catch {
          return "Enter a valid URL";
        }
      },
    });
    if (p.isCancel(urlInput)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    const trimmed = urlInput.trim().replace(/\/+$/, "");
    if (trimmed) {
      auth = { publicBaseUrl: trimmed };
    }
  }

  return {
    server: { deploymentMode, host: hostStr.trim(), port, serveUi: true },
    auth,
  };
}

