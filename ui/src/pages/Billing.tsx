import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { costsApi } from "../api/costs";
import { billingApi } from "../api/billing";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatCents, relativeTime, cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  RefreshCw,
  Zap,
  Plus,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { CREDIT_TOP_UP_AMOUNTS } from "@substaff/shared";

/* ── Helpers ── */

type DatePreset = "mtd" | "7d" | "30d" | "ytd" | "all";

const PRESET_LABELS: Record<DatePreset, string> = {
  mtd: "This Month",
  "7d": "7 Days",
  "30d": "30 Days",
  ytd: "Year",
  all: "All Time",
};

function computeRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (preset) {
    case "mtd": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.toISOString(), to };
    }
    case "7d": {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "30d": {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "ytd": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d.toISOString(), to };
    }
    case "all":
      return { from: "", to: "" };
  }
}

/* ── Sparkline SVG ── */

function Sparkline({
  data,
  color = "currentColor",
  className,
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });

  const fillPoints = [`0,${h}`, ...points, `${w},${h}`].join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`spark-grad-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline
        points={fillPoints}
        fill={`url(#spark-grad-${color.replace(/[^a-z0-9]/gi, "")})`}
        stroke="none"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ── Horizontal bar chart ── */

function HorizontalBar({
  items,
}: {
  items: { label: string; value: number; color?: string }[];
}) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = (item.value / maxVal) * 100;
        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate min-w-0 text-muted-foreground">{item.label}</span>
              <span className="font-medium shrink-0 ml-2 font-mono text-foreground">
                {formatCents(item.value)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.color ?? "var(--chart-1)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Transaction type labels ── */

function txTypeLabel(type: string): string {
  switch (type) {
    case "top_up": return "Credit top-up";
    case "usage_deduction": return "Agent run cost";
    case "adjustment": return "Balance adjustment";
    case "refund": return "Refund";
    default: return type.replace(/_/g, " ");
  }
}

/* ── Main ── */

export function Billing() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<DatePreset>("mtd");
  const [selectedTopUp, setSelectedTopUp] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Billing" }]);
  }, [setBreadcrumbs]);

  const { from, to } = useMemo(() => computeRange(preset), [preset]);

  const billingQuery = useQuery({
    queryKey: queryKeys.billing.me,
    queryFn: () => billingApi.getMyBilling(),
  });

  const creditsQuery = useQuery({
    queryKey: [...queryKeys.billing.credits(billingQuery.data?.vendorId ?? ""), selectedCompanyId],
    queryFn: () => billingApi.getCreditHistory(billingQuery.data!.vendorId, 50, 0, selectedCompanyId ?? undefined),
    enabled: !!billingQuery.data?.vendorId,
  });

  const costsQuery = useQuery({
    queryKey: queryKeys.costs(selectedCompanyId!, from || undefined, to || undefined),
    queryFn: async () => {
      const [summary, byAgent, byProject] = await Promise.all([
        costsApi.summary(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byAgent(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byProject(selectedCompanyId!, from || undefined, to || undefined),
      ]);
      return { summary, byAgent, byProject };
    },
    enabled: !!selectedCompanyId,
  });

  const topUpMutation = useMutation({
    mutationFn: (amountCents: number) =>
      billingApi.createTopUp(billingQuery.data!.vendorId, amountCents),
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const balanceHistory = useMemo(() => {
    if (!creditsQuery.data || creditsQuery.data.length < 2) return [];
    return [...creditsQuery.data].reverse().map((tx) => tx.balanceAfterCents);
  }, [creditsQuery.data]);

  const spendingData = useMemo(() => {
    if (!creditsQuery.data) return [];
    return [...creditsQuery.data]
      .reverse()
      .filter((tx) => tx.amountCents < 0)
      .map((tx) => Math.abs(tx.amountCents));
  }, [creditsQuery.data]);

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message="Select a company to view billing." />;
  }

  if (billingQuery.isLoading) return <PageSkeleton variant="costs" />;

  const billing = billingQuery.data;
  if (!billing) {
    return <EmptyState icon={CreditCard} message="Unable to load billing information." />;
  }

  const balanceNegative = billing.creditBalanceCents <= 0;
  const credits = creditsQuery.data;
  const costs = costsQuery.data;

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.billing.me });
    if (billing.vendorId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.credits(billing.vendorId) });
    }
  };

  const resolvedTopUpAmount = customAmount !== ""
    ? (selectedTopUp ?? 0)
    : (selectedTopUp ?? 0);

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Billing</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage your balance, usage, and payment methods.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* ── Balance Alert ── */}
      {balanceNegative && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10 shrink-0">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Balance depleted</p>
            <p className="text-xs text-muted-foreground">
              Agent runs are blocked. Add credits to resume operations.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setSelectedTopUp(2500);
              setCustomAmount("");
              document.getElementById("add-credits")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Credits
          </Button>
        </div>
      )}

      {/* ── Metric Cards ── */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Credit Balance */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
          {balanceHistory.length >= 2 && (
            <div className="absolute bottom-0 left-0 right-0 h-14 opacity-70">
              <Sparkline
                data={balanceHistory}
                color={balanceNegative ? "var(--destructive)" : "var(--chart-4)"}
                className="w-full h-full"
              />
            </div>
          )}
          <div className="relative space-y-1.5">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex items-center justify-center h-6 w-6 rounded-md",
                balanceNegative ? "bg-destructive/10" : "bg-chart-4/10"
              )}>
                <Wallet className={cn("h-3.5 w-3.5", balanceNegative ? "text-destructive" : "text-chart-4")} />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Credit Balance</span>
            </div>
            <p className={cn("text-2xl font-bold tracking-tight", balanceNegative && "text-destructive")}>
              {formatCents(billing.creditBalanceCents)}
            </p>
          </div>
        </div>

        {/* Period Spend */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
          {spendingData.length >= 2 && (
            <div className="absolute bottom-0 left-0 right-0 h-14 opacity-70">
              <Sparkline data={spendingData} color="var(--chart-1)" className="w-full h-full" />
            </div>
          )}
          <div className="relative space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-chart-1/10">
                <TrendingUp className="h-3.5 w-3.5 text-chart-1" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">{PRESET_LABELS[preset]}</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {costs ? formatCents(costs.summary.platformSpendCents) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Credits consumed by agent runs</p>
          </div>
        </div>

        {/* Billing Model */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
          <div className="relative space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-chart-5/10">
                <Zap className="h-3.5 w-3.5 text-chart-5" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Billing Model</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">Pay as you go</p>
            <p className="text-xs text-muted-foreground">Top up credits, consumed as agents run</p>
          </div>
        </div>
      </div>

      {/* ── Add Credits ── */}
      <div id="add-credits" className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Add Credits</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Credits are consumed as your agents run. Top up to keep agents active.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CREDIT_TOP_UP_AMOUNTS.map((amount) => (
            <button
              key={amount}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                selectedTopUp === amount && customAmount === ""
                  ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-foreground/20 hover:bg-accent/40"
              )}
              onClick={() => { setSelectedTopUp(amount); setCustomAmount(""); }}
            >
              {formatCents(amount)}
            </button>
          ))}
          <button
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
              customAmount !== ""
                ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                : "border-border bg-card hover:border-foreground/20 hover:bg-accent/40"
            )}
            onClick={() => { setSelectedTopUp(null); setCustomAmount(customAmount || "0"); }}
          >
            Other
          </button>

          {customAmount !== "" && (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Amount"
                value={customAmount === "0" ? "" : customAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomAmount(val || "0");
                  const cents = Math.round(parseFloat(val) * 100);
                  setSelectedTopUp(cents > 0 ? cents : null);
                }}
                autoFocus
                className="w-28 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
              />
            </div>
          )}

          {selectedTopUp != null && selectedTopUp > 0 && (
            <Button
              size="sm"
              disabled={topUpMutation.isPending}
              onClick={() => topUpMutation.mutate(selectedTopUp)}
              className="ml-1"
            >
              {topUpMutation.isPending ? "Redirecting..." : `Top up ${formatCents(selectedTopUp)}`}
            </Button>
          )}
        </div>
      </div>

      {/* ── Cost Breakdown ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Cost Breakdown</h3>
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
            {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
              <button
                key={p}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-all font-medium",
                  preset === p
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setPreset(p)}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {costsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground py-4">Loading cost data...</div>
        ) : costs ? (
          <>
            {/* Budget utilization bar */}
            {costs.summary.budgetCents > 0 && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Spend:{" "}
                    <span className="text-foreground font-medium">
                      {formatCents(costs.summary.platformSpendCents)}
                    </span>
                    {" / "}
                    {formatCents(costs.summary.budgetCents)}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                      costs.summary.utilizationPercent > 90
                        ? "bg-red-400/10 text-red-500"
                        : costs.summary.utilizationPercent > 70
                          ? "bg-yellow-400/10 text-yellow-600"
                          : "bg-green-400/10 text-green-600"
                    )}
                  >
                    {costs.summary.utilizationPercent}%
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      costs.summary.utilizationPercent > 90
                        ? "bg-red-400"
                        : costs.summary.utilizationPercent > 70
                          ? "bg-yellow-400"
                          : "bg-green-400"
                    )}
                    style={{ width: `${Math.min(100, costs.summary.utilizationPercent)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {/* By Agent */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">By Agent</h4>
                  <span className="text-xs text-muted-foreground">
                    {costs.byAgent.length} agent{costs.byAgent.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {costs.byAgent.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No costs recorded yet.</p>
                ) : (
                  <HorizontalBar
                    items={costs.byAgent.map((row, i) => ({
                      label: row.agentName ?? row.agentId.slice(0, 8),
                      value: row.platformCostCents,
                      color: `var(--chart-${(i % 5) + 1})`,
                    }))}
                  />
                )}
              </div>

              {/* By Project */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">By Project</h4>
                  <span className="text-xs text-muted-foreground">
                    {costs.byProject.length} project{costs.byProject.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {costs.byProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No costs recorded yet.</p>
                ) : (
                  <HorizontalBar
                    items={costs.byProject.map((row, i) => ({
                      label: row.projectName ?? "Unattributed",
                      value: row.platformCostCents,
                      color: `var(--chart-${(i % 5) + 1})`,
                    }))}
                  />
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Credit History ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Credit History</h3>
        {creditsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !credits || credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
              <span>Transaction</span>
              <span className="text-right w-20">Amount</span>
              <span className="text-right w-20">Balance</span>
            </div>
            <div className="divide-y divide-border/50">
              {credits.map((tx) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-2.5 text-sm hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "flex items-center justify-center h-7 w-7 rounded-lg shrink-0",
                        tx.amountCents >= 0 ? "bg-green-400/10" : "bg-muted"
                      )}
                    >
                      {tx.amountCents >= 0 ? (
                        <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {tx.description ?? txTypeLabel(tx.type)}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground/60" />
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(tx.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "font-medium font-mono text-sm text-right w-20 tabular-nums",
                      tx.amountCents >= 0 ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {tx.amountCents >= 0 ? "+" : ""}
                    {formatCents(tx.amountCents)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono text-right w-20 tabular-nums">
                    {formatCents(tx.balanceAfterCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
