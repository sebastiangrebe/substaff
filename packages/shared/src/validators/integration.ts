import { z } from "zod";

export const connectIntegrationSchema = z.object({
  definitionId: z.string().uuid(),
  credentialSecretIds: z.record(z.string(), z.string().uuid()),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const updateIntegrationSchema = z.object({
  credentialSecretIds: z.record(z.string(), z.string().uuid()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export type ConnectIntegration = z.infer<typeof connectIntegrationSchema>;
export type UpdateIntegration = z.infer<typeof updateIntegrationSchema>;
