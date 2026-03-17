import { useEffect, useState, useCallback } from "react";
import { useParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { strategyApi } from "../api/strategy";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Crosshair, Hash, Pencil, Plus, Target, Trash2, TrendingUp, User } from "lucide-react";
import { cn, formatDate } from "../lib/utils";
import type { KeyResultWithEntries, ObjectiveWithKeyResults } from "@substaff/shared";

/* ── Progress helpers ── */

function ProgressBar({ percent, size = "md" }: { percent: number; size?: "sm" | "md" }) {
  const color =
    percent >= 80 ? "bg-green-500" : percent >= 50 ? "bg-yellow-400" : percent >= 20 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className={cn("w-full bg-muted/50 rounded-full overflow-hidden", size === "sm" ? "h-1.5" : "h-2.5")}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${percent}%` }} />
    </div>
  );
}

/* ── Hero Radial Gauge ── */

function HeroGauge({ percent }: { percent: number }) {
  const size = 160;
  const strokeWidth = 10;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percent / 100) * circumference;
  const color =
    percent >= 80 ? "stroke-emerald-500" : percent >= 50 ? "stroke-yellow-400" : percent >= 20 ? "stroke-orange-400" : "stroke-red-500";
  const glowColor =
    percent >= 80 ? "drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" : percent >= 50 ? "drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" : percent >= 20 ? "drop-shadow-[0_0_8px_rgba(251,146,60,0.4)]" : "drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className={cn("-rotate-90", glowColor)}>
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-muted/30" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-1000 ease-out", color)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight">{percent}%</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">progress</span>
      </div>
    </div>
  );
}

/* ── Stat pill for hero area ── */

function StatPill({ label, value, icon: Icon }: { label: string; value: string | number; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/50 border border-border/40 px-3 py-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none">{label}</span>
        <span className="text-sm font-semibold leading-tight mt-0.5">{value}</span>
      </div>
    </div>
  );
}

function KpiTrendChart({ entries }: { entries: { value: number; recordedAt: string }[] }) {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  const values = sorted.map((e) => e.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 200;
  const h = 48;
  const padding = 4;
  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (w - padding * 2);
      const y = h - padding - ((v - min) / range) * (h - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const fillPoints = `${padding},${h - padding} ${points} ${padding + ((values.length - 1) / (values.length - 1)) * (w - padding * 2)},${h - padding}`;
  const uid = `trend-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[200px] h-12" preserveAspectRatio="none">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="[stop-color:var(--color-primary)]" stopOpacity="0.3" />
          <stop offset="100%" className="[stop-color:var(--color-primary)]" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${uid})`} points={fillPoints} />
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" points={points} />
      {/* Endpoint dot */}
      {values.length > 0 && (() => {
        const lastX = padding + ((values.length - 1) / (values.length - 1)) * (w - padding * 2);
        const lastY = h - padding - ((values[values.length - 1] - min) / range) * (h - padding * 2);
        return <circle cx={lastX} cy={lastY} r="2.5" className="fill-primary" />;
      })()}
    </svg>
  );
}

/* ── Visualization components ── */

function KpiBarChart({ entries }: { entries: { value: number; recordedAt: string }[] }) {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  const values = sorted.map((e) => e.value);
  const max = Math.max(...values, 1);
  const w = 200;
  const h = 48;
  const padding = 4;
  const barGap = 2;
  const barWidth = Math.max(2, (w - padding * 2 - barGap * (values.length - 1)) / values.length);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[200px] h-12" preserveAspectRatio="none">
      {values.map((v, i) => {
        const barHeight = ((v / max) * (h - padding * 2));
        const x = padding + i * (barWidth + barGap);
        const y = h - padding - barHeight;
        return (
          <rect key={i} x={x} y={y} width={barWidth} height={barHeight} rx={1} className="fill-primary" />
        );
      })}
    </svg>
  );
}

function KpiGauge({ percent }: { percent: number }) {
  const size = 64;
  const strokeWidth = 5;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 80 ? "stroke-emerald-500" : percent >= 50 ? "stroke-yellow-400" : percent >= 20 ? "stroke-orange-400" : "stroke-red-500";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-muted/30" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-700", color)}
        />
      </svg>
      <span className="absolute text-xs font-bold">{percent}%</span>
    </div>
  );
}

function KpiVisualization({ kr }: { kr: KeyResultWithEntries }) {
  const vizType = kr.visualizationType ?? "progress";
  const entries = kr.entries ?? [];

  switch (vizType) {
    case "gauge":
      return (
        <div className="flex items-center gap-3">
          <KpiGauge percent={kr.progressPercent} />
          {entries.length > 0 && (
            <span className="text-xs text-muted-foreground">{entries.length} entries</span>
          )}
        </div>
      );
    case "bar":
      return entries.length > 0 ? (
        <div className="flex items-center gap-3">
          <KpiBarChart entries={entries} />
          <span className="text-xs text-muted-foreground">{entries.length} entries</span>
        </div>
      ) : null;
    case "line":
      return entries.length > 0 ? (
        <div className="flex items-center gap-3">
          <KpiTrendChart entries={entries} />
          <span className="text-xs text-muted-foreground">{entries.length} entries</span>
        </div>
      ) : null;
    case "progress":
    default:
      return (
        <>
          <div className="space-y-1">
            <ProgressBar percent={kr.progressPercent} />
          </div>
          {entries.length > 0 && (
            <div className="flex items-center gap-3">
              <KpiTrendChart entries={entries} />
              <span className="text-xs text-muted-foreground">{entries.length} entries</span>
            </div>
          )}
        </>
      );
  }
}

/* ── New Key Result Dialog ── */

function NewKeyResultDialog({
  open,
  onOpenChange,
  companyId,
  objectiveId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  objectiveId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("count");
  const [direction, setDirection] = useState("up");
  const [vizType, setVizType] = useState("progress");

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => strategyApi.createKeyResult(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.detail(objectiveId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.summary(companyId) });
      onOpenChange(false);
      setTitle("");
      setTargetValue("");
      setUnit("count");
      setDirection("up");
      setVizType("progress");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Key Result</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Monthly active users" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target</Label>
              <Input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="100"
              />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">Count</SelectItem>
                  <SelectItem value="percent">Percent</SelectItem>
                  <SelectItem value="currency_cents">Currency (cents)</SelectItem>
                  <SelectItem value="seconds">Seconds</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="up">Higher is better</SelectItem>
                  <SelectItem value="down">Lower is better</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visualization</Label>
              <Select value={vizType} onValueChange={setVizType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="progress">Progress bar</SelectItem>
                  <SelectItem value="line">Line chart</SelectItem>
                  <SelectItem value="gauge">Gauge</SelectItem>
                  <SelectItem value="bar">Bar chart</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!title.trim() || !targetValue || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                objectiveId,
                title: title.trim(),
                targetValue: Number(targetValue),
                unit,
                direction,
                visualizationType: vizType,
              })
            }
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Add KPI Entry Dialog ── */

function AddKpiEntryDialog({
  open,
  onOpenChange,
  companyId,
  keyResultId,
  objectiveId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  keyResultId: string;
  objectiveId: string;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => strategyApi.createKpiEntry(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.detail(objectiveId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.summary(companyId) });
      onOpenChange(false);
      setValue("");
      setNote("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report KPI Value</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Value</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="42" />
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context about this measurement..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!value || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                keyResultId,
                value: Number(value),
                note: note.trim() || null,
              })
            }
          >
            Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit Key Result Dialog ── */

function EditKeyResultDialog({
  open,
  onOpenChange,
  companyId,
  objectiveId,
  kr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  objectiveId: string;
  kr: KeyResultWithEntries;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(kr.title);
  const [description, setDescription] = useState(kr.description ?? "");
  const [targetValue, setTargetValue] = useState(String(kr.targetValue));
  const [unit, setUnit] = useState<string>(kr.unit);
  const [direction, setDirection] = useState<string>(kr.direction);
  const [vizType, setVizType] = useState<string>(kr.visualizationType);
  const [status, setStatus] = useState<string>(kr.status);

  // Sync form state when kr changes (e.g. after refetch)
  useEffect(() => {
    if (!open) return;
    setTitle(kr.title);
    setDescription(kr.description ?? "");
    setTargetValue(String(kr.targetValue));
    setUnit(kr.unit);
    setDirection(kr.direction);
    setVizType(kr.visualizationType);
    setStatus(kr.status);
  }, [open, kr]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => strategyApi.updateKeyResult(kr.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.detail(objectiveId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.summary(companyId) });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Key Result</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target</Label>
              <Input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">Count</SelectItem>
                  <SelectItem value="percent">Percent</SelectItem>
                  <SelectItem value="currency_cents">Currency (cents)</SelectItem>
                  <SelectItem value="seconds">Seconds</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="up">Higher is better</SelectItem>
                  <SelectItem value="down">Lower is better</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visualization</Label>
              <Select value={vizType} onValueChange={setVizType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="progress">Progress bar</SelectItem>
                  <SelectItem value="line">Line chart</SelectItem>
                  <SelectItem value="gauge">Gauge</SelectItem>
                  <SelectItem value="bar">Bar chart</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="achieved">Achieved</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!title.trim() || !targetValue || updateMutation.isPending}
            onClick={() =>
              updateMutation.mutate({
                title: title.trim(),
                description: description.trim() || null,
                targetValue: Number(targetValue),
                unit,
                direction,
                visualizationType: vizType,
                status,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Key Result Card ── */

function KeyResultCard({
  kr,
  companyId,
  objectiveId,
  agentName,
}: {
  kr: KeyResultWithEntries;
  companyId: string;
  objectiveId: string;
  agentName: (id: string | null) => string | null;
}) {
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => strategyApi.removeKeyResult(kr.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.detail(objectiveId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.summary(companyId) });
    },
  });

  const unitLabel = kr.unit === "percent" ? "%" : kr.unit === "currency_cents" ? " cents" : kr.unit === "seconds" ? "s" : "";

  return (
    <>
      <EditKeyResultDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        companyId={companyId}
        objectiveId={objectiveId}
        kr={kr}
      />
      <AddKpiEntryDialog
        open={kpiDialogOpen}
        onOpenChange={setKpiDialogOpen}
        companyId={companyId}
        keyResultId={kr.id}
        objectiveId={objectiveId}
      />
      <div className="group relative rounded-lg border border-border/60 bg-card overflow-hidden hover:border-border transition-colors">
        {/* Top accent bar based on progress */}
        <div className="h-0.5 w-full bg-muted/30">
          <div
            className={cn(
              "h-full transition-all duration-700",
              kr.progressPercent >= 80 ? "bg-emerald-500" : kr.progressPercent >= 50 ? "bg-yellow-400" : kr.progressPercent >= 20 ? "bg-orange-400" : "bg-red-500",
            )}
            style={{ width: `${kr.progressPercent}%` }}
          />
        </div>

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <KpiGauge percent={kr.progressPercent} />
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm truncate">{kr.title}</h4>
                {kr.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{kr.description}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <StatusBadge status={kr.status} />
                  {kr.ownerAgentId && agentName(kr.ownerAgentId) && (
                    <Identity name={agentName(kr.ownerAgentId)!} size="sm" />
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon-xs" onClick={() => setEditDialogOpen(true)}>
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => deleteMutation.mutate()}>
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Metrics row */}
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none">Current</span>
                <span className="text-lg font-bold tabular-nums leading-tight mt-0.5">{kr.currentValue}<span className="text-xs font-normal text-muted-foreground">{unitLabel}</span></span>
              </div>
              <div className="h-6 w-px bg-border/40" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none">Target</span>
                <span className="text-lg font-bold tabular-nums leading-tight mt-0.5">{kr.targetValue}<span className="text-xs font-normal text-muted-foreground">{unitLabel}</span></span>
              </div>
              {(kr.entries ?? []).length > 0 && (
                <>
                  <div className="h-6 w-px bg-border/40" />
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none">Trend</span>
                    <div className="mt-0.5">
                      <KpiTrendChart entries={kr.entries ?? []} />
                      {(kr.entries ?? []).length < 2 && (
                        <KpiBarChart entries={kr.entries ?? []} />
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => setKpiDialogOpen(true)}>
              <TrendingUp className="h-3 w-3 mr-1" />
              Add Entry
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main component ── */

export function ObjectiveDetail() {
  const { objectiveId } = useParams<{ objectiveId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [krDialogOpen, setKrDialogOpen] = useState(false);

  const { data: objective, isLoading, error } = useQuery({
    queryKey: queryKeys.strategy.detail(objectiveId!),
    queryFn: () => strategyApi.getObjectiveDetails(objectiveId!),
    enabled: !!objectiveId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Strategy", href: "/strategy" },
      { label: objective?.title ?? "Objective" },
    ]);
  }, [setBreadcrumbs, objective?.title]);

  const agentName = useCallback(
    (id: string | null) => {
      if (!id || !agents) return null;
      return agents.find((a) => a.id === id)?.name ?? null;
    },
    [agents],
  );

  const updateMutation = useMutation({
    mutationFn: ({ data }: { data: Record<string, unknown> }) =>
      strategyApi.updateObjective(objectiveId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.detail(objectiveId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy.summary(selectedCompanyId!) });
    },
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive p-4">{(error as Error).message}</p>;
  if (!objective) return <EmptyState icon={Crosshair} message="Objective not found." />;

  const obj = objective as ObjectiveWithKeyResults;
  const keyResults = obj.keyResults ?? [];
  const overallProgress = obj.overallProgressPercent ?? 0;

  const achievedCount = keyResults.filter((kr) => kr.status === "achieved").length;
  const atRiskCount = keyResults.filter((kr) => kr.status === "at_risk").length;

  return (
    <>
      {selectedCompanyId && objectiveId && (
        <NewKeyResultDialog
          open={krDialogOpen}
          onOpenChange={setKrDialogOpen}
          companyId={selectedCompanyId}
          objectiveId={objectiveId}
        />
      )}
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* ── Hero Section ── */}
        <div className="relative rounded-xl border border-border/60 bg-card overflow-hidden">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-chart-4/[0.03] pointer-events-none" />

          <div className="relative p-6">
            {/* Top row: title + status */}
            <div className="flex items-start justify-between gap-4 mb-1">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Objective</span>
                </div>
                <h1 className="text-xl font-bold tracking-tight">{obj.title}</h1>
                {obj.description && (
                  <p className="text-sm text-muted-foreground mt-1 max-w-lg">{obj.description}</p>
                )}
              </div>
              <Select
                value={obj.status}
                onValueChange={(status) => updateMutation.mutate({ data: { status } })}
              >
                <SelectTrigger className="h-8 w-32 text-xs shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="achieved">Achieved</SelectItem>
                  <SelectItem value="stalled">Stalled</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Center: Gauge + summary stats */}
            <div className="mt-6 flex items-center gap-8">
              <HeroGauge percent={overallProgress} />

              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatPill label="Key Results" value={keyResults.length} icon={Hash} />
                <StatPill label="Achieved" value={achievedCount} icon={Crosshair} />
                {atRiskCount > 0 && <StatPill label="At Risk" value={atRiskCount} icon={TrendingUp} />}
                <StatPill label="Time Period" value={obj.timePeriod} icon={Calendar} />
                {obj.ownerAgentId && agentName(obj.ownerAgentId) && (
                  <StatPill label="Owner" value={agentName(obj.ownerAgentId)!} icon={User} />
                )}
              </div>
            </div>

            {/* Metadata row */}
            <div className="mt-4 pt-3 border-t border-border/30 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {obj.periodStart && <span>Start: {formatDate(obj.periodStart)}</span>}
              {obj.periodEnd && <span>End: {formatDate(obj.periodEnd)}</span>}
              <span>Created: {formatDate(obj.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* ── Key Results Section ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Key Results</h2>
              <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5 tabular-nums">
                {keyResults.length}
              </span>
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={() => setKrDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Key Result
            </Button>
          </div>

          {keyResults.length === 0 && (
            <EmptyState
              icon={TrendingUp}
              message="No key results yet."
              action="Add Key Result"
              onAction={() => setKrDialogOpen(true)}
            />
          )}

          <div className="grid gap-3">
            {keyResults.map((kr) => (
              <KeyResultCard
                key={kr.id}
                kr={kr}
                companyId={selectedCompanyId!}
                objectiveId={objectiveId!}
                agentName={agentName}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
