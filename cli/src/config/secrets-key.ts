// Secrets key management is no longer part of the config.
// This module is kept as a stub for any remaining references.

export type EnsureSecretsKeyResult =
  | { status: "created"; path: string }
  | { status: "existing"; path: string }
  | { status: "skipped_env"; path: null }
  | { status: "skipped_provider"; path: null };

export function ensureLocalSecretsKeyFile(
  _config: unknown,
  _configPath?: string,
): EnsureSecretsKeyResult {
  return { status: "skipped_provider", path: null };
}
