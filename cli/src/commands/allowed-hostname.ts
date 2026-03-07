import * as p from "@clack/prompts";
import pc from "picocolors";
import { normalizeHostnameInput } from "../config/hostnames.js";

export async function addAllowedHostname(host: string, opts: { config?: string }): Promise<void> {
  const normalized = normalizeHostnameInput(host);
  p.log.info(
    `Allowed hostnames are no longer managed in configuration. Hostname ${pc.cyan(normalized)} was not added.`,
  );
}

