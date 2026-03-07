/** Supported LLM providers for managed key provisioning. */
export type LlmProvider = "anthropic" | "openai";

export const LLM_PROVIDERS: readonly LlmProvider[] = ["anthropic", "openai"] as const;

/** Result of resolving which API key to use for an LLM call. */
export interface ResolvedLlmKey {
  /** The API key value. */
  key: string;
  /** True when the platform's managed key is being used (usage should be billed). */
  managed: boolean;
}

/** Vendor-level LLM configuration returned by the API. */
export interface VendorLlmConfig {
  /** Whether the vendor has their own key for each provider. */
  providers: Record<LlmProvider, { hasOwnKey: boolean; usingManagedKey: boolean }>;
  /** Whether managed keys are available on this platform instance. */
  managedKeysAvailable: boolean;
}

/** Input for setting a vendor's own LLM API key. */
export interface SetVendorLlmKeyInput {
  provider: LlmProvider;
  /** The API key value. Pass null to remove the vendor's own key and fall back to managed. */
  apiKey: string | null;
}
