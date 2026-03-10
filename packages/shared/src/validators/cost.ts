import { z } from "zod";

export const createCostEventSchema = z.object({
  agentId: z.string().uuid(),
  issueId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  goalId: z.string().uuid().optional().nullable(),
  billingCode: z.string().optional().nullable(),
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative().optional().default(0),
  outputTokens: z.number().int().nonnegative().optional().default(0),
  costCents: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
});

export type CreateCostEvent = z.infer<typeof createCostEventSchema>;

export const updateBudgetSchema = z.object({
  budgetMonthlyCents: z.number().int().nonnegative(),
});

export type UpdateBudget = z.infer<typeof updateBudgetSchema>;

export const topUpSchema = z.object({
  amountCents: z.number().int().min(500, "Minimum top-up is $5.00"),
});

export type TopUp = z.infer<typeof topUpSchema>;

export const updateMarkupSchema = z.object({
  markupBasisPoints: z
    .number()
    .int()
    .min(10000, "Markup cannot be below 1.0x")
    .max(50000, "Markup cannot exceed 5.0x"),
});

export type UpdateMarkup = z.infer<typeof updateMarkupSchema>;
