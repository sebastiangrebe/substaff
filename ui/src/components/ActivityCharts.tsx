import { useState, useRef, useCallback } from "react";
import type { HeartbeatRun } from "@substaff/shared";

/* ---- Utilities ---- */

export function getLast14Days(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ---- Sub-components ---- */

function DateLabels({ days }: { days: string[] }) {
  return (
    <div className="flex gap-[3px] mt-1.5">
      {days.map((day, i) => (
        <div key={day} className="flex-1 text-center">
          {(i === 0 || i === 6 || i === 13) ? (
            <span className="text-[11px] text-muted-foreground tabular-nums">{formatDayLabel(day)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

type TooltipLine = { color?: string; label: string; value: string };

function ChartTooltip({ day, lines, x, visible }: { day: string; lines: TooltipLine[]; x: number; visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="absolute z-50 pointer-events-none bg-popover border border-border rounded-md px-2.5 py-1.5 shadow-md text-xs whitespace-nowrap"
      style={{ bottom: "calc(100% + 6px)", left: x, transform: "translateX(-50%)" }}
    >
      <div className="font-medium mb-1">{formatDayLabel(day)}</div>
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {line.color && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: line.color }} />}
          <span className="text-muted-foreground">{line.label}</span>
          <span className="ml-auto pl-2 font-medium">{line.value}</span>
        </div>
      ))}
    </div>
  );
}

function useBarHover() {
  const [hover, setHover] = useState<{ day: string; x: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onEnter = useCallback((day: string, e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const barRect = e.currentTarget.getBoundingClientRect();
    const x = barRect.left + barRect.width / 2 - rect.left;
    setHover({ day, x });
  }, []);

  const onLeave = useCallback(() => setHover(null), []);

  return { hover, containerRef, onEnter, onLeave };
}

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-2">
      {items.map(item => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---- Chart Components ---- */

export function RunActivityChart({ runs }: { runs: HeartbeatRun[] }) {
  const days = getLast14Days();

  const grouped = new Map<string, { succeeded: number; failed: number; other: number }>();
  for (const day of days) grouped.set(day, { succeeded: 0, failed: 0, other: 0 });
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    if (run.status === "succeeded") entry.succeeded++;
    else if (run.status === "failed" || run.status === "timed_out") entry.failed++;
    else entry.other++;
  }

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => v.succeeded + v.failed + v.other), 1);
  const hasData = Array.from(grouped.values()).some(v => v.succeeded + v.failed + v.other > 0);

  if (!hasData) return <p className="text-xs text-muted-foreground">No runs yet</p>;

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = entry.succeeded + entry.failed + entry.other;
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" title={`${day}: ${total} runs`}>
              {total > 0 ? (
                <div className="flex flex-col-reverse gap-px overflow-hidden rounded-t-sm" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                  {entry.succeeded > 0 && <div className="bg-emerald-500" style={{ flex: entry.succeeded }} />}
                  {entry.failed > 0 && <div className="bg-red-500" style={{ flex: entry.failed }} />}
                  {entry.other > 0 && <div className="bg-neutral-500" style={{ flex: entry.other }} />}
                </div>
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}

const priorityColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

const priorityOrder = ["critical", "high", "medium", "low"] as const;

export function PriorityChart({ issues }: { issues: { priority: string; createdAt: Date }[] }) {
  const days = getLast14Days();
  const grouped = new Map<string, Record<string, number>>();
  for (const day of days) grouped.set(day, { critical: 0, high: 0, medium: 0, low: 0 });
  for (const issue of issues) {
    const day = new Date(issue.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    if (issue.priority in entry) entry[issue.priority]++;
  }

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => Object.values(v).reduce((a, b) => a + b, 0)), 1);
  const hasData = Array.from(grouped.values()).some(v => Object.values(v).reduce((a, b) => a + b, 0) > 0);

  if (!hasData) return <p className="text-xs text-muted-foreground">No issues</p>;

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = Object.values(entry).reduce((a, b) => a + b, 0);
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" title={`${day}: ${total} issues`}>
              {total > 0 ? (
                <div className="flex flex-col-reverse gap-px overflow-hidden rounded-t-sm" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                  {priorityOrder.map(p => entry[p] > 0 ? (
                    <div key={p} style={{ flex: entry[p], backgroundColor: priorityColors[p] }} />
                  ) : null)}
                </div>
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={priorityOrder.map(p => ({ color: priorityColors[p], label: p.charAt(0).toUpperCase() + p.slice(1) }))} />
    </div>
  );
}

const statusColors: Record<string, string> = {
  todo: "#3b82f6",
  in_progress: "#8b5cf6",
  in_review: "#a855f7",
  done: "#10b981",
  blocked: "#ef4444",
  cancelled: "#6b7280",
  backlog: "#64748b",
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "Working on it",
  in_review: "Review",
  done: "Done",
  blocked: "Stuck",
  cancelled: "Cancelled",
  backlog: "Later",
};

export function IssueStatusChart({ issues }: { issues: { status: string; createdAt: Date }[] }) {
  const days = getLast14Days();
  const { hover, containerRef, onEnter, onLeave } = useBarHover();
  const allStatuses = new Set<string>();
  const grouped = new Map<string, Record<string, number>>();
  for (const day of days) grouped.set(day, {});
  for (const issue of issues) {
    const day = new Date(issue.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    entry[issue.status] = (entry[issue.status] ?? 0) + 1;
    allStatuses.add(issue.status);
  }

  const statusOrder = ["todo", "in_progress", "in_review", "done", "blocked", "cancelled", "backlog"].filter(s => allStatuses.has(s));
  const maxValue = Math.max(...Array.from(grouped.values()).map(v => Object.values(v).reduce((a, b) => a + b, 0)), 1);
  const hasData = allStatuses.size > 0;

  if (!hasData) return <p className="text-xs text-muted-foreground">No issues</p>;

  const tooltipLines = hover ? (() => {
    const entry = grouped.get(hover.day)!;
    return statusOrder.filter(s => (entry[s] ?? 0) > 0).map(s => ({
      color: statusColors[s] ?? "#6b7280",
      label: statusLabels[s] ?? s,
      value: String(entry[s]),
    }));
  })() : [];

  return (
    <div>
      <div ref={containerRef} className="relative flex items-end gap-[3px] h-20">
        <ChartTooltip day={hover?.day ?? ""} lines={tooltipLines} x={hover?.x ?? 0} visible={!!hover} />
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = Object.values(entry).reduce((a, b) => a + b, 0);
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" onMouseEnter={(e) => onEnter(day, e)} onMouseLeave={onLeave}>
              {total > 0 ? (
                <div className="flex flex-col-reverse gap-px overflow-hidden rounded-t-sm" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                  {statusOrder.map(s => (entry[s] ?? 0) > 0 ? (
                    <div key={s} style={{ flex: entry[s], backgroundColor: statusColors[s] ?? "#6b7280" }} />
                  ) : null)}
                </div>
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={statusOrder.map(s => ({ color: statusColors[s] ?? "#6b7280", label: statusLabels[s] ?? s }))} />
    </div>
  );
}

const sourceColors: Record<string, string> = {
  timer: "#3b82f6",
  assignment: "#8b5cf6",
  on_demand: "#06b6d4",
  automation: "#f59e0b",
};

const sourceLabels: Record<string, string> = {
  timer: "Timer",
  assignment: "Assignment",
  on_demand: "On-demand",
  automation: "Automation",
};

const sourceOrder = ["timer", "assignment", "on_demand", "automation"] as const;

function getRunCost(run: HeartbeatRun): number {
  const u = run.usageJson as Record<string, unknown> | null;
  const r = run.resultJson as Record<string, unknown> | null;
  return Number(u?.cost_usd ?? u?.total_cost_usd ?? u?.costUsd ?? r?.total_cost_usd ?? r?.cost_usd ?? r?.costUsd ?? 0);
}

export function TotalCostChart({ runs }: { runs: HeartbeatRun[] }) {
  const days = getLast14Days();
  const { hover, containerRef, onEnter, onLeave } = useBarHover();
  const allSources = new Set<string>();
  const grouped = new Map<string, Record<string, number>>();
  for (const day of days) grouped.set(day, {});
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    const source = run.invocationSource || "other";
    const cost = getRunCost(run);
    entry[source] = (entry[source] ?? 0) + cost;
    allSources.add(source);
  }

  const activeSources = sourceOrder.filter(s => allSources.has(s));
  const otherSources = Array.from(allSources).filter(s => !sourceOrder.includes(s as typeof sourceOrder[number]));
  const allActiveKeys = [...activeSources, ...otherSources];

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => Object.values(v).reduce((a, b) => a + b, 0)), 0.01);
  const hasData = Array.from(grouped.values()).some(v => Object.values(v).reduce((a, b) => a + b, 0) > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">No cost data yet</p>;

  const tooltipLines = hover ? (() => {
    const entry = grouped.get(hover.day)!;
    const total = Object.values(entry).reduce((a, b) => a + b, 0);
    const lines: TooltipLine[] = allActiveKeys.filter(s => (entry[s] ?? 0) > 0).map(s => ({
      color: sourceColors[s] ?? "#6b7280",
      label: sourceLabels[s] ?? s,
      value: `$${(entry[s] ?? 0).toFixed(2)}`,
    }));
    if (lines.length > 1) lines.push({ label: "Total", value: `$${total.toFixed(2)}` });
    return lines;
  })() : [];

  return (
    <div>
      <div ref={containerRef} className="relative flex items-end gap-[3px] h-20">
        <ChartTooltip day={hover?.day ?? ""} lines={tooltipLines} x={hover?.x ?? 0} visible={!!hover} />
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = Object.values(entry).reduce((a, b) => a + b, 0);
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" onMouseEnter={(e) => onEnter(day, e)} onMouseLeave={onLeave}>
              {total > 0 ? (
                <div className="flex flex-col-reverse gap-px overflow-hidden rounded-t-sm" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                  {allActiveKeys.map(s => (entry[s] ?? 0) > 0 ? (
                    <div key={s} style={{ flex: entry[s], backgroundColor: sourceColors[s] ?? "#6b7280" }} />
                  ) : null)}
                </div>
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={allActiveKeys.map(s => ({ color: sourceColors[s] ?? "#6b7280", label: sourceLabels[s] ?? s }))} />
    </div>
  );
}

export function CostPerRunChart({ runs }: { runs: HeartbeatRun[] }) {
  const days = getLast14Days();
  const { hover, containerRef, onEnter, onLeave } = useBarHover();
  const allSources = new Set<string>();
  const grouped = new Map<string, Record<string, { totalCost: number; count: number }>>();
  for (const day of days) grouped.set(day, {});
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const dayEntry = grouped.get(day);
    if (!dayEntry) continue;
    const source = run.invocationSource || "other";
    if (!dayEntry[source]) dayEntry[source] = { totalCost: 0, count: 0 };
    dayEntry[source].totalCost += getRunCost(run);
    dayEntry[source].count++;
    allSources.add(source);
  }

  const activeSources = sourceOrder.filter(s => allSources.has(s));
  const otherSources = Array.from(allSources).filter(s => !sourceOrder.includes(s as typeof sourceOrder[number]));
  const allActiveKeys = [...activeSources, ...otherSources];

  const maxValue = Math.max(...Array.from(grouped.values()).map(dayEntry => {
    let total = 0;
    for (const s of Object.values(dayEntry)) total += s.count > 0 ? s.totalCost / s.count : 0;
    return total;
  }), 0.01);
  const hasData = Array.from(grouped.values()).some(dayEntry => Object.values(dayEntry).some(s => s.count > 0));
  if (!hasData) return <p className="text-xs text-muted-foreground">No cost data yet</p>;

  const tooltipLines = hover ? (() => {
    const dayEntry = grouped.get(hover.day)!;
    const lines: TooltipLine[] = allActiveKeys.filter(s => dayEntry[s]?.count > 0).map(s => ({
      color: sourceColors[s] ?? "#6b7280",
      label: sourceLabels[s] ?? s,
      value: `$${(dayEntry[s].totalCost / dayEntry[s].count).toFixed(2)}`,
    }));
    const totalCount = Object.values(dayEntry).reduce((a, v) => a + v.count, 0);
    const totalCost = Object.values(dayEntry).reduce((a, v) => a + v.totalCost, 0);
    if (totalCount > 0) lines.push({ label: "Avg", value: `$${(totalCost / totalCount).toFixed(2)}` });
    return lines;
  })() : [];

  return (
    <div>
      <div ref={containerRef} className="relative flex items-end gap-[3px] h-20">
        <ChartTooltip day={hover?.day ?? ""} lines={tooltipLines} x={hover?.x ?? 0} visible={!!hover} />
        {days.map(day => {
          const dayEntry = grouped.get(day)!;
          const avgBySource: Record<string, number> = {};
          let total = 0;
          for (const [s, v] of Object.entries(dayEntry)) {
            const avg = v.count > 0 ? v.totalCost / v.count : 0;
            avgBySource[s] = avg;
            total += avg;
          }
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" onMouseEnter={(e) => onEnter(day, e)} onMouseLeave={onLeave}>
              {total > 0 ? (
                <div className="flex flex-col-reverse gap-px overflow-hidden rounded-t-sm" style={{ height: `${heightPct}%`, minHeight: 2 }}>
                  {allActiveKeys.map(s => (avgBySource[s] ?? 0) > 0 ? (
                    <div key={s} style={{ flex: avgBySource[s], backgroundColor: sourceColors[s] ?? "#6b7280" }} />
                  ) : null)}
                </div>
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={allActiveKeys.map(s => ({ color: sourceColors[s] ?? "#6b7280", label: sourceLabels[s] ?? s }))} />
    </div>
  );
}

export function TaskCompletionChart({ issues }: { issues: { status: string; createdAt: Date; completedAt?: Date | null }[] }) {
  const days = getLast14Days();
  const { hover, containerRef, onEnter, onLeave } = useBarHover();
  const grouped = new Map<string, { created: number; completed: number }>();
  for (const day of days) grouped.set(day, { created: 0, completed: 0 });
  for (const issue of issues) {
    const createdDay = new Date(issue.createdAt).toISOString().slice(0, 10);
    const createdEntry = grouped.get(createdDay);
    if (createdEntry) createdEntry.created++;
    if (issue.completedAt) {
      const completedDay = new Date(issue.completedAt).toISOString().slice(0, 10);
      const completedEntry = grouped.get(completedDay);
      if (completedEntry) completedEntry.completed++;
    }
  }

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => Math.max(v.created, v.completed)), 1);
  const hasData = Array.from(grouped.values()).some(v => v.created > 0 || v.completed > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">No tasks yet</p>;

  const tooltipLines = hover ? (() => {
    const entry = grouped.get(hover.day)!;
    return [
      { color: "#3b82f6", label: "Created", value: String(entry.created) },
      { color: "#10b981", label: "Completed", value: String(entry.completed) },
    ];
  })() : [];

  return (
    <div>
      <div ref={containerRef} className="relative flex items-end gap-[3px] h-20">
        <ChartTooltip day={hover?.day ?? ""} lines={tooltipLines} x={hover?.x ?? 0} visible={!!hover} />
        {days.map(day => {
          const entry = grouped.get(day)!;
          const createdPct = (entry.created / maxValue) * 100;
          const completedPct = (entry.completed / maxValue) * 100;
          const hasAny = entry.created > 0 || entry.completed > 0;
          return (
            <div key={day} className="flex-1 h-full flex items-end gap-px" onMouseEnter={(e) => onEnter(day, e)} onMouseLeave={onLeave}>
              {hasAny ? (
                <>
                  <div className="flex-1 flex flex-col justify-end h-full">
                    <div className="bg-blue-500 rounded-t-sm" style={{ height: `${createdPct}%`, minHeight: entry.created > 0 ? 2 : 0 }} />
                  </div>
                  <div className="flex-1 flex flex-col justify-end h-full">
                    <div className="bg-emerald-500 rounded-t-sm" style={{ height: `${completedPct}%`, minHeight: entry.completed > 0 ? 2 : 0 }} />
                  </div>
                </>
              ) : (
                <div className="flex-1 bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={[
        { color: "#3b82f6", label: "Created" },
        { color: "#10b981", label: "Completed" },
      ]} />
    </div>
  );
}

export function SuccessRateChart({ runs }: { runs: HeartbeatRun[] }) {
  const days = getLast14Days();
  const { hover, containerRef, onEnter, onLeave } = useBarHover();
  const grouped = new Map<string, { succeeded: number; total: number }>();
  for (const day of days) grouped.set(day, { succeeded: 0, total: 0 });
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    entry.total++;
    if (run.status === "succeeded") entry.succeeded++;
  }

  const hasData = Array.from(grouped.values()).some(v => v.total > 0);
  if (!hasData) return <p className="text-xs text-muted-foreground">No runs yet</p>;

  const tooltipLines = hover ? (() => {
    const entry = grouped.get(hover.day)!;
    if (entry.total === 0) return [];
    const rate = Math.round((entry.succeeded / entry.total) * 100);
    return [
      { label: "Success rate", value: `${rate}%` },
      { label: "Succeeded", value: `${entry.succeeded}` },
      { label: "Total", value: `${entry.total}` },
    ];
  })() : [];

  return (
    <div>
      <div ref={containerRef} className="relative flex items-end gap-[3px] h-20">
        <ChartTooltip day={hover?.day ?? ""} lines={tooltipLines} x={hover?.x ?? 0} visible={!!hover} />
        {days.map(day => {
          const entry = grouped.get(day)!;
          const rate = entry.total > 0 ? entry.succeeded / entry.total : 0;
          const color = entry.total === 0 ? undefined : rate >= 0.8 ? "#10b981" : rate >= 0.5 ? "#eab308" : "#ef4444";
          return (
            <div key={day} className="flex-1 h-full flex flex-col justify-end" onMouseEnter={(e) => onEnter(day, e)} onMouseLeave={onLeave}>
              {entry.total > 0 ? (
                <div className="rounded-t-sm" style={{ height: `${rate * 100}%`, minHeight: 2, backgroundColor: color }} />
              ) : (
                <div className="bg-muted/30 rounded-sm" style={{ height: 2 }} />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={[
        { color: "#10b981", label: "≥ 80%" },
        { color: "#eab308", label: "50–79%" },
        { color: "#ef4444", label: "< 50%" },
      ]} />
    </div>
  );
}
