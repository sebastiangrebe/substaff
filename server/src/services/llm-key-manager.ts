import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { companies, costEvents } from "@substaff/db";
import type { LlmProvider, ResolvedLlmKey, VendorLlmConfig } from "@substaff/shared";
import { notFound, unprocessable } from "../errors.js";
import { secretService } from "./secrets.js";
import { logger } from "../middleware/logger.js";

/**
 * Environment variable names for platform-level managed LLM keys.
 * These are NOT stored in the database — they come from the server environment only.
 */
const MANAGED_KEY_ENV_VARS: Record<LlmProvider, string> = {
  anthropic: "MANAGED_ANTHROPIC_API_KEY",
  openai: "MANAGED_OPENAI_API_KEY",
};

/**
 * Secret names used when a vendor stores their own API key via the secrets service.
 * These are stored per-company in the companySecrets table.
 */
const VENDOR_SECRET_NAMES: Record<LlmProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/**
 * Returns the platform's managed API key for a provider from environment variables.
 * Returns null if the managed key is not configured.
 */
function getManagedKey(provider: LlmProvider): string | null {
  const envVar = MANAGED_KEY_ENV_VARS[provider];
  return process.env[envVar] ?? null;
}

export function llmKeyManagerService(db: Db) {
  const secrets = secretService(db);

  return {
    /**
     * Provisions access to a managed LLM API key for a company.
     * The platform shares its own key and meters usage — no per-company key is stored.
     * Returns the managed key for the given provider, or null if not configured.
     */
    provisionKey(
      _companyId: string,
      provider: LlmProvider = "anthropic",
    ): { key: string; provider: LlmProvider } | null {
      const key = getManagedKey(provider);
      if (!key) {
        logger.warn(
          { provider },
          "Managed LLM key not available — environment variable not set",
        );
        return null;
      }
      return { key, provider };
    },

    /**
     * Resolves the API key to use for a company's LLM calls.
     *
     * Resolution order:
     * 1. Check if the company has its own key stored via the secrets service
     * 2. Fall back to the platform's managed key from environment variables
     *
     * Returns `{ key, managed }` so callers know whether usage should be billed.
     */
    async resolveKey(
      companyId: string,
      provider: LlmProvider,
    ): Promise<ResolvedLlmKey> {
      // 1. Check if the company has its own key via the secrets service
      const secretName = VENDOR_SECRET_NAMES[provider];
      const ownSecret = await secrets.getByName(companyId, secretName);

      if (ownSecret) {
        try {
          const resolvedValue = await secrets
            .resolveEnvBindings(companyId, {
              [secretName]: {
                type: "secret_ref" as const,
                secretId: ownSecret.id,
                version: "latest",
              },
            })
            .then((resolved) => resolved[secretName]);

          if (resolvedValue) {
            return { key: resolvedValue, managed: false };
          }
        } catch (err) {
          logger.warn(
            { companyId, provider, error: err instanceof Error ? err.message : String(err) },
            "Failed to resolve vendor's own LLM key, falling back to managed key",
          );
        }
      }

      // 2. Fall back to the platform's managed key
      const managedKey = getManagedKey(provider);
      if (!managedKey) {
        throw unprocessable(
          `No LLM API key available for provider "${provider}". ` +
            "Either set a company-level key or configure a platform managed key.",
        );
      }

      return { key: managedKey, managed: true };
    },

    /**
     * Records a cost event for managed key usage.
     * This should be called after every LLM invocation that used a managed key.
     */
    async recordUsage(
      companyId: string,
      vendorId: string,
      agentId: string,
      data: {
        model: string;
        provider: string;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        issueId?: string | null;
        projectId?: string | null;
        goalId?: string | null;
      },
    ) {
      const costCents = Math.round(data.costUsd * 100);

      const [event] = await db
        .insert(costEvents)
        .values({
          companyId,
          vendorId,
          agentId,
          provider: data.provider,
          model: data.model,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          costCents,
          billingCode: "managed_llm_key",
          issueId: data.issueId ?? null,
          projectId: data.projectId ?? null,
          goalId: data.goalId ?? null,
          occurredAt: new Date(),
        })
        .returning();

      logger.info(
        {
          companyId,
          vendorId,
          agentId,
          provider: data.provider,
          model: data.model,
          costCents,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
        },
        "Recorded managed LLM key usage",
      );

      return event;
    },

    /**
     * Returns the LLM configuration for a vendor, describing which providers
     * have vendor-owned keys and which would use the platform's managed key.
     */
    async getVendorLlmConfig(
      vendorId: string,
      companyId: string,
    ): Promise<VendorLlmConfig> {
      const providers = {} as VendorLlmConfig["providers"];

      for (const provider of ["anthropic", "openai"] as const) {
        const secretName = VENDOR_SECRET_NAMES[provider];
        const ownSecret = await secrets.getByName(companyId, secretName);
        const managedAvailable = getManagedKey(provider) !== null;

        providers[provider] = {
          hasOwnKey: ownSecret !== null,
          usingManagedKey: ownSecret === null && managedAvailable,
        };
      }

      const managedKeysAvailable =
        getManagedKey("anthropic") !== null || getManagedKey("openai") !== null;

      return { providers, managedKeysAvailable };
    },
  };
}
