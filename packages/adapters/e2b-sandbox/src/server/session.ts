import type { AdapterSessionCodec } from "@substaff/adapter-utils";

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown): Record<string, unknown> | null {
    if (typeof raw === "object" && raw !== null) {
      return raw as Record<string, unknown>;
    }
    return null;
  },
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
    return params;
  },
  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    return typeof params.sandboxId === "string" ? params.sandboxId : null;
  },
};
