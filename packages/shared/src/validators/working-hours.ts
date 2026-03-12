import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayScheduleSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(timePattern, "Must be HH:MM format (24h)"),
  end: z.string().regex(timePattern, "Must be HH:MM format (24h)"),
});

export const workingHoursSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().min(1),
  schedule: z.object({
    monday: dayScheduleSchema,
    tuesday: dayScheduleSchema,
    wednesday: dayScheduleSchema,
    thursday: dayScheduleSchema,
    friday: dayScheduleSchema,
    saturday: dayScheduleSchema,
    sunday: dayScheduleSchema,
  }),
});

export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;
