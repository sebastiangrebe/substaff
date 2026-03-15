import { useState, useMemo } from "react";
import type { WorkingHoursConfig, DayOfWeek } from "@substaff/shared";
import { DAYS_OF_WEEK } from "@substaff/shared";
import { cn } from "../../lib/utils";
import { Clock, AlertTriangle } from "lucide-react";

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export const DEFAULT_WORKING_HOURS: WorkingHoursConfig = {
  enabled: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  schedule: Object.fromEntries(
    DAYS_OF_WEEK.map((d) => [
      d,
      {
        enabled: d !== "saturday" && d !== "sunday",
        start: "09:00",
        end: "17:00",
      },
    ]),
  ) as WorkingHoursConfig["schedule"],
};

interface WorkingHoursSetupProps {
  value: WorkingHoursConfig;
  onChange: (config: WorkingHoursConfig) => void;
}

const inputClass =
  "rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 transition-colors";

export function WorkingHoursSetup({ value, onChange }: WorkingHoursSetupProps) {
  const [tzSearch, setTzSearch] = useState("");
  const [tzOpen, setTzOpen] = useState(false);

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [
        "UTC",
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "Europe/London",
        "Europe/Berlin",
        "Europe/Paris",
        "Asia/Tokyo",
        "Asia/Shanghai",
        "Asia/Kolkata",
        "Australia/Sydney",
      ];
    }
  }, []);

  const filteredTimezones = useMemo(() => {
    if (!tzSearch) return timezones.slice(0, 50);
    const q = tzSearch.toLowerCase();
    return timezones.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 50);
  }, [timezones, tzSearch]);

  function update(patch: Partial<WorkingHoursConfig>) {
    onChange({ ...value, ...patch });
  }

  function updateDay(day: DayOfWeek, patch: Partial<WorkingHoursConfig["schedule"][DayOfWeek]>) {
    update({
      schedule: {
        ...value.schedule,
        [day]: { ...value.schedule[day], ...patch },
      },
    });
  }

  const isOutsideWorkingHours = useMemo(() => {
    if (!value.enabled) return false;
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: value.timezone,
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = Object.fromEntries(
        formatter.formatToParts(now).map((p) => [p.type, p.value]),
      );
      const currentDay = (parts.weekday?.toLowerCase() ?? "") as DayOfWeek;
      const currentTime = `${parts.hour}:${parts.minute}`;
      const daySchedule = value.schedule[currentDay];
      if (!daySchedule?.enabled) return true;
      return currentTime < daySchedule.start || currentTime >= daySchedule.end;
    } catch {
      return false;
    }
  }, [value]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Working hours</h3>
          <p className="text-xs text-muted-foreground">
            Define when agents are allowed to run. You can change this later.
          </p>
        </div>
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground/70">Enable working hours</span>
        <button
          type="button"
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            value.enabled ? "bg-green-600" : "bg-muted-foreground/20",
          )}
          onClick={() => update({ enabled: !value.enabled })}
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
              value.enabled ? "translate-x-4.5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {value.enabled && (
        <div className="space-y-4">
          {/* Timezone */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Timezone
            </label>
            <div className="relative">
              <input
                type="text"
                value={tzOpen ? tzSearch : value.timezone}
                onChange={(e) => setTzSearch(e.target.value)}
                onFocus={() => {
                  setTzOpen(true);
                  setTzSearch("");
                }}
                onBlur={() => {
                  setTimeout(() => setTzOpen(false), 200);
                }}
                placeholder="Search timezone..."
                className={cn(inputClass, "w-full")}
              />
              {tzOpen && (
                <div className="absolute z-50 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-border bg-popover/95 backdrop-blur-lg shadow-xl">
                  {filteredTimezones.map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs text-foreground/70 hover:bg-accent",
                        tz === value.timezone && "bg-accent text-foreground font-medium",
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        update({ timezone: tz });
                        setTzOpen(false);
                      }}
                    >
                      {tz}
                    </button>
                  ))}
                  {filteredTimezones.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No timezones found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Day schedule grid */}
          <div className="space-y-1">
            <div className="grid grid-cols-[40px_auto_1fr_1fr] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/60 px-1 mb-1">
              <span>Day</span>
              <span>On</span>
              <span>Start</span>
              <span>End</span>
            </div>
            {DAYS_OF_WEEK.map((day) => {
              const ds = value.schedule[day];
              return (
                <div
                  key={day}
                  className={cn(
                    "grid grid-cols-[40px_auto_1fr_1fr] gap-2 items-center rounded-lg px-1 py-1",
                    !ds.enabled && "opacity-40",
                  )}
                >
                  <span className="text-sm text-foreground/70">{DAY_LABELS[day]}</span>
                  <button
                    type="button"
                    className={cn(
                      "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                      ds.enabled ? "bg-green-600" : "bg-muted-foreground/20",
                    )}
                    onClick={() => updateDay(day, { enabled: !ds.enabled })}
                  >
                    <span
                      className={cn(
                        "inline-block h-3 w-3 rounded-full bg-white transition-transform",
                        ds.enabled ? "translate-x-3.5" : "translate-x-0.5",
                      )}
                    />
                  </button>
                  <input
                    type="time"
                    value={ds.start}
                    onChange={(e) => updateDay(day, { start: e.target.value })}
                    disabled={!ds.enabled}
                    className={cn(inputClass, "dark:[color-scheme:dark]")}
                  />
                  <input
                    type="time"
                    value={ds.end}
                    onChange={(e) => updateDay(day, { end: e.target.value })}
                    disabled={!ds.enabled}
                    className={cn(inputClass, "dark:[color-scheme:dark]")}
                  />
                </div>
              );
            })}
          </div>

          {isOutsideWorkingHours && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-200/80 leading-relaxed">
                The current time is outside the configured working hours. Agents
                won't start working until the next scheduled window begins.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
