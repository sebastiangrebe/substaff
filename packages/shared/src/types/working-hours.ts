export interface DaySchedule {
  enabled: boolean;
  start: string; // "HH:MM" 24h format
  end: string; // "HH:MM" 24h format
}

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const DAYS_OF_WEEK: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export type WeekSchedule = Record<DayOfWeek, DaySchedule>;

export interface WorkingHoursConfig {
  enabled: boolean;
  timezone: string; // IANA timezone e.g. "America/New_York"
  schedule: WeekSchedule;
}
