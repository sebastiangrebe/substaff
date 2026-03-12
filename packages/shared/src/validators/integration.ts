import { z } from "zod";

export const connectIntegrationSchema = z.object({
  appName: z.string(),
  integrationId: z.string().optional(),
});

export const updateIntegrationSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export type ConnectIntegration = z.infer<typeof connectIntegrationSchema>;
export type UpdateIntegration = z.infer<typeof updateIntegrationSchema>;
