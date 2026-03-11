import { z } from "zod";
import { ROLE_CLASSIFICATIONS } from "../constants.js";

export const createCompanyRoleSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Slug must be lowercase alphanumeric with underscores, starting with a letter"),
  displayLabel: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  classification: z.enum(ROLE_CLASSIFICATIONS).default("ic"),
});

export type CreateCompanyRole = z.infer<typeof createCompanyRoleSchema>;

export const updateCompanyRoleSchema = createCompanyRoleSchema.partial();
export type UpdateCompanyRole = z.infer<typeof updateCompanyRoleSchema>;
