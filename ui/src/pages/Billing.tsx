import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { costsApi } from "../api/costs";
import { billingApi } from "../api/billing";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatCents, formatTokens, cn } from "../lib/utils";
import { Identity } from "../components/Identity";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  RefreshCw,
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

/* ── Sparkline SVG from credit history ── */

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
      <polyline
        points={fillPoints}
        fill={color}
        opacity="0.08"
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
    <div className="space-y-2">
      {items.map((item) => {
        const pct = (item.value / maxVal) * 100;
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate min-w-0">{item.label}</span>
              <span className="font-medium shrink-0 ml-2 font-mono">
                {formatCents(item.value)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
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
    queryKey: queryKeys.billing.credits(billingQuery.data?.vendorId ?? ""),
    queryFn: () => billingApi.getCreditHistory(billingQuery.data!.vendorId),
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

  // Build sparkline data from credit history (balance over time, reversed to chronological)
  const balanceHistory = useMemo(() => {
    if (!creditsQuery.data || creditsQuery.data.length < 2) return [];
    return [...creditsQuery.data].reverse().map((tx) => tx.balanceAfterCents);
  }, [creditsQuery.data]);

  // Build spending sparkline from credit deductions
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your balance, usage, and payment methods.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.billing.me });
            if (billing.vendorId) {
              void queryClient.invalidateQueries({ queryKey: queryKeys.billing.credits(billing.vendorId) });
            }
          }}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Credit Balance */}
        <div className="relative overflow-hidden rounded-xl border border-border p-4">
          {balanceHistory.length >= 2 && (
            <div className="absolute bottom-0 left-0 right-0 h-12 opacity-60">
              <Sparkline
                data={balanceHistory}
                color={balanceNegative ? "var(--destructive)" : "var(--chart-2)"}
                className="w-full h-full"
              />
            </div>
          )}
          <div className="relative space-y-1">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Credit Balance
              </span>
            </div>
            <p className={cn("text-2xl font-bold", balanceNegative && "text-destructive")}>
              {formatCents(billing.creditBalanceCents)}
            </p>
            {balanceNegative && (
              <p className="text-xs text-destructive">
                Balance depleted — agent runs blocked
              </p>
            )}
          </div>
        </div>

        {/* Period Spend */}
        <div className="relative overflow-hidden rounded-xl border border-border p-4">
          {spendingData.length >= 2 && (
            <div className="absolute bottom-0 left-0 right-0 h-12 opacity-60">
              <Sparkline data={spendingData} color="var(--chart-1)" className="w-full h-full" />
            </div>
          )}
          <div className="relative space-y-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {PRESET_LABELS[preset]}
              </span>
            </div>
            <p className="text-2xl font-bold">
              {costs
                ? formatCents(costs.summary.platformSpendCents)
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Credits consumed by agent runs</p>
          </div>
        </div>

        {/* Billing Model */}
        <div className="relative overflow-hidden rounded-xl border border-border p-4">
          <div className="relative space-y-1">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Billing Model
              </span>
            </div>
            <p className="text-2xl font-bold">Pay as you go</p>
            <p className="text-xs text-muted-foreground">Top up credits, consumed as agents run</p>
          </div>
        </div>
      </div>

      {/* ── Add Credits ── */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add Credits</h3>
        <p className="text-sm text-muted-foreground">
          Credits are consumed as your agents run. Top up to keep agents active.
        </p>
        <div className="flex flex-wrap gap-2">
          {CREDIT_TOP_UP_AMOUNTS.map((amount) => (
            <button
              key={amount}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                selectedTopUp === amount && !customAmount
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-foreground/30 hover:bg-accent/50"
              )}
              onClick={() => { setSelectedTopUp(amount); setCustomAmount(""); }}
            >
              {formatCents(amount)}
            </button>
          ))}
          <button
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              customAmount !== ""
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-foreground/30 hover:bg-accent/50"
            )}
            onClick={() => { setSelectedTopUp(null); setCustomAmount(customAmount || "0"); }}
          >
            Other
          </button>
        </div>
        {customAmount !== "" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Enter amount"
              value={customAmount === "0" ? "" : customAmount}
              onChange={(e) => {
                const val = e.target.value;
                setCustomAmount(val || "0");
                const cents = Math.round(parseFloat(val) * 100);
                setSelectedTopUp(cents > 0 ? cents : null);
              }}
              autoFocus
              className="w-40 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
            />
          </div>
        )}
        {selectedTopUp != null && selectedTopUp > 0 && (
          <Button
            size="sm"
            disabled={topUpMutation.isPending}
            onClick={() => topUpMutation.mutate(selectedTopUp)}
          >
            {topUpMutation.isPending ? "Redirecting..." : `Top up ${formatCents(selectedTopUp)}`}
          </Button>
        )}
      </div>

      {/* ── Cost Breakdown ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Cost Breakdown</h3>
          <div className="flex items-center gap-1">
            {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
              <button
                key={p}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors",
                  preset === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
            {/* Summary bar */}
            {costs.summary.budgetCents > 0 && (
              <div className="rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Spend: <span className="text-foreground font-medium">{formatCents(costs.summary.platformSpendCents)}</span>
                    {" / "}
                    {formatCents(costs.summary.budgetCents)}
                  </span>
                  <span className="text-muted-foreground font-medium">
                    {costs.summary.utilizationPercent}%
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
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
              <div className="rounded-xl border border-border p-4 space-y-3">
                <h4 className="text-sm font-semibold">By Agent</h4>
                {costs.byAgent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No costs yet.</p>
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
              <div className="rounded-xl border border-border p-4 space-y-3">
                <h4 className="text-sm font-semibold">By Project</h4>
                {costs.byProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No costs yet.</p>
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
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {credits.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={cn(
                      "flex items-center justify-center h-6 w-6 rounded-full shrink-0",
                      tx.amountCents >= 0 ? "bg-green-400/15" : "bg-red-400/15"
                    )}
                  >
                    {tx.amountCents >= 0 ? (
                      <ArrowUpRight className="h-3 w-3 text-green-500" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-red-500" />
                    )}
                  </div>
                  <span className="truncate">
                    {tx.description ?? tx.type.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <span
                    className={cn(
                      "font-medium font-mono",
                      tx.amountCents >= 0 ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {tx.amountCents >= 0 ? "+" : ""}
                    {formatCents(tx.amountCents)}
                  </span>
                  <span className="text-xs text-muted-foreground block font-mono">
                    bal: {formatCents(tx.balanceAfterCents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
