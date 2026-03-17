import { z } from "zod";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_TIME_PERIODS,
  KEY_RESULT_STATUSES,
  KEY_RESULT_UNITS,
  KEY_RESULT_DIRECTIONS,
  KEY_RESULT_VIZ_TYPES,
} from "../constants.js";

export const createObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  ownerAgentId: z.string().uuid().optional().nullable(),
  timePeriod: z.enum(OBJECTIVE_TIME_PERIODS).optional().default("quarterly"),
  periodStart: z.string().datetime().optional().nullable(),
  periodEnd: z.string().datetime().optional().nullable(),
  status: z.enum(OBJECTIVE_STATUSES).optional().default("draft"),
  parentId: z.string().uuid().optional().nullable(),
  goalId: z.string().uuid().optional().nullable(),
  approvalId: z.string().uuid().optional().nullable(),
});

export type CreateObjective = z.infer<typeof createObjectiveSchema>;

export const updateObjectiveSchema = createObjectiveSchema.partial();

export type UpdateObjective = z.infer<typeof updateObjectiveSchema>;

export const createKeyResultSchema = z.object({
  objectiveId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  targetValue: z.number().int(),
  currentValue: z.number().int().optional().default(0),
  startingValue: z.number().int().optional().default(0),
  unit: z.enum(KEY_RESULT_UNITS).optional().default("count"),
  direction: z.enum(KEY_RESULT_DIRECTIONS).optional().default("up"),
  visualizationType: z.enum(KEY_RESULT_VIZ_TYPES).optional().default("progress"),
  ownerAgentId: z.string().uuid().optional().nullable(),
  status: z.enum(KEY_RESULT_STATUSES).optional().default("active"),
});

export type CreateKeyResult = z.infer<typeof createKeyResultSchema>;

export const updateKeyResultSchema = createKeyResultSchema.omit({ objectiveId: true }).partial();

export type UpdateKeyResult = z.infer<typeof updateKeyResultSchema>;

export const createKpiEntrySchema = z.object({
  keyResultId: z.string().uuid(),
  value: z.number().int(),
  recordedAt: z.string().datetime().optional(),
  note: z.string().optional().nullable(),
});

export type CreateKpiEntry = z.infer<typeof createKpiEntrySchema>;
