import { useState, useMemo } from "react";
import type { WorkingHoursConfig, DayOfWeek } from "@substaff/shared";
import { DAYS_OF_WEEK } from "@substaff/shared";
import { cn } from "../lib/utils";

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DEFAULT_CONFIG: WorkingHoursConfig = {
  enabled: false,
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

interface WorkingHoursEditorProps {
  value: WorkingHoursConfig | null;
  onChange: (config: WorkingHoursConfig | null) => void;
  /** Show an "Override company" toggle instead of "Enable working hours" */
  overrideMode?: boolean;
}

const inputClass =
  "rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus-visible:ring-ring focus-visible:ring-[3px]";

export function WorkingHoursEditor({ value, onChange, overrideMode }: WorkingHoursEditorProps) {
  const config = value ?? DEFAULT_CONFIG;
  const [tzSearch, setTzSearch] = useState("");
  const [tzOpen, setTzOpen] = useState(false);

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      // Fallback for environments that don't support supportedValuesOf
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
    onChange({ ...config, ...patch });
  }

  function updateDay(day: DayOfWeek, patch: Partial<WorkingHoursConfig["schedule"][DayOfWeek]>) {
    update({
      schedule: {
        ...config.schedule,
        [day]: { ...config.schedule[day], ...patch },
      },
    });
  }

  const toggleLabel = overrideMode ? "Override company working hours" : "Enable working hours";

  return (
    <div className="space-y-3">
      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm">{toggleLabel}</span>
        <button
          type="button"
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            config.enabled ? "bg-green-600" : "bg-muted",
          )}
          onClick={() => update({ enabled: !config.enabled })}
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
              config.enabled ? "translate-x-4.5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {config.enabled && (
        <div className="space-y-4">
          {/* Timezone */}
          <div>
            <label className="text-sm font-medium mb-1 block">Timezone</label>
            <div className="relative">
              <input
                type="text"
                value={tzOpen ? tzSearch : config.timezone}
                onChange={(e) => setTzSearch(e.target.value)}
                onFocus={() => {
                  setTzOpen(true);
                  setTzSearch("");
                }}
                onBlur={() => {
                  // Delay to allow click on dropdown items
                  setTimeout(() => setTzOpen(false), 200);
                }}
                placeholder="Search timezone..."
                className={cn(inputClass, "w-full")}
              />
              {tzOpen && (
                <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {filteredTimezones.map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-sm hover:bg-accent",
                        tz === config.timezone && "bg-accent font-medium",
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
                    <div className="px-3 py-2 text-sm text-muted-foreground">No timezones found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Day schedule grid */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_auto_80px_80px] gap-2 text-xs text-muted-foreground px-1">
              <span>Day</span>
              <span>Active</span>
              <span>Start</span>
              <span>End</span>
            </div>
            {DAYS_OF_WEEK.map((day) => {
              const ds = config.schedule[day];
              return (
                <div
                  key={day}
                  className={cn(
                    "grid grid-cols-[1fr_auto_80px_80px] gap-2 items-center rounded-md px-1 py-1",
                    !ds.enabled && "opacity-50",
                  )}
                >
                  <span className="text-sm">{DAY_LABELS[day]}</span>
                  <button
                    type="button"
                    className={cn(
                      "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                      ds.enabled ? "bg-green-600" : "bg-muted",
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
                    className={cn(inputClass, "text-xs")}
                  />
                  <input
                    type="time"
                    value={ds.end}
                    onChange={(e) => updateDay(day, { end: e.target.value })}
                    disabled={!ds.enabled}
                    className={cn(inputClass, "text-xs")}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
