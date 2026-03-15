import { useState } from "react";
import { formatCents, cn } from "../lib/utils";
import { Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(dollars: string): number {
  const parsed = parseFloat(dollars);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

/* ── Utilization bar (shared) ── */

function UtilizationBar({ budgetCents, spentCents }: { budgetCents: number; spentCents: number }) {
  if (budgetCents === 0) return null;
  const utilization = (spentCents / budgetCents) * 100;
  return (
    <div className="max-w-32 h-1 bg-muted rounded-full overflow-hidden mt-1">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          utilization >= 100
            ? "bg-red-400"
            : utilization > 80
              ? "bg-yellow-400"
              : "bg-green-400",
        )}
        style={{ width: `${Math.min(100, utilization)}%` }}
      />
    </div>
  );
}

/* ── Settings variant: full-width input field matching SettingsField pattern ── */

function SettingsBudgetField({
  label,
  hint,
  budgetCents,
  spentCents,
  onSave,
}: {
  label: string;
  hint: string;
  budgetCents: number;
  spentCents: number;
  onSave?: (cents: number) => void;
}) {
  const [value, setValue] = useState(budgetCents > 0 ? centsToDollars(budgetCents) : "");
  const [dirty, setDirty] = useState(false);

  const handleChange = (v: string) => {
    setValue(v);
    setDirty(true);
  };

  const handleBlur = () => {
    if (!dirty) return;
    const cents = value.trim() === "" ? 0 : dollarsToCents(value);
    onSave?.(cents);
    setDirty(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const spendDisplay = budgetCents > 0
    ? `${formatCents(spentCents)} spent of ${formatCents(budgetCents)}`
    : spentCents > 0
      ? `${formatCents(spentCents)} spent`
      : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs text-muted-foreground">· {hint}</span>
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <input
          className="w-full rounded-md border border-border bg-transparent pl-7 pr-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="0.00 (unlimited)"
          readOnly={!onSave}
        />
      </div>
      {spendDisplay && (
        <p className="text-xs text-muted-foreground">{spendDisplay}</p>
      )}
      <UtilizationBar budgetCents={budgetCents} spentCents={spentCents} />
    </div>
  );
}

/* ── Compact variant: click-to-edit, used in properties panels ── */

function CompactBudgetBar({
  label,
  budgetCents,
  spentCents,
  onSave,
}: {
  label: string;
  budgetCents: number;
  spentCents: number;
  onSave?: (cents: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const isUnlimited = budgetCents === 0;

  const handleOpen = (v: boolean) => {
    if (v) setDraft(budgetCents > 0 ? centsToDollars(budgetCents) : "");
    setOpen(v);
  };

  const save = () => {
    const cents = draft.trim() === "" ? 0 : dollarsToCents(draft);
    onSave?.(cents);
    setOpen(false);
  };

  const valueDisplay = isUnlimited ? (
    <span className="text-muted-foreground">Unlimited</span>
  ) : (
    <span>{formatCents(spentCents)} / {formatCents(budgetCents)}</span>
  );

  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div>
        {onSave ? (
          <Popover open={open} onOpenChange={handleOpen}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-sm cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors">
                {valueDisplay}
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-2" align="start" collisionPadding={16}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground shrink-0">$</span>
                <input
                  className="w-full text-sm bg-transparent border border-border rounded-md px-2 py-1 outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="0 = unlimited"
                  autoFocus
                />
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-sm">{valueDisplay}</span>
        )}
        <UtilizationBar budgetCents={budgetCents} spentCents={spentCents} />
      </div>
    </div>
  );
}

/* ── Public API ── */

interface BudgetEditorProps {
  budgetMonthlyCents: number;
  platformSpentMonthlyCents: number;
  budgetTotalCents: number;
  platformSpentTotalCents: number;
  onUpdateMonthly?: (cents: number) => void;
  onUpdateTotal?: (cents: number) => void;
  /** Emphasize total budget (e.g. for issues/tasks) */
  emphasizeTotal?: boolean;
  /** "settings" uses full-width input fields; "compact" (default) uses click-to-edit */
  variant?: "compact" | "settings";
}

export function BudgetEditor({
  budgetMonthlyCents,
  platformSpentMonthlyCents,
  budgetTotalCents,
  platformSpentTotalCents,
  onUpdateMonthly,
  onUpdateTotal,
  emphasizeTotal,
  variant = "compact",
}: BudgetEditorProps) {
  const items = emphasizeTotal
    ? [
        { label: "Total Budget", hint: "Lifetime cap. Never resets.", budget: budgetTotalCents, spent: platformSpentTotalCents, onSave: onUpdateTotal },
        { label: "Monthly Budget", hint: "Resets on the 1st of each month.", budget: budgetMonthlyCents, spent: platformSpentMonthlyCents, onSave: onUpdateMonthly },
      ]
    : [
        { label: "Monthly Budget", hint: "Resets on the 1st of each month.", budget: budgetMonthlyCents, spent: platformSpentMonthlyCents, onSave: onUpdateMonthly },
        { label: "Total Budget", hint: "Lifetime cap. Never resets.", budget: budgetTotalCents, spent: platformSpentTotalCents, onSave: onUpdateTotal },
      ];

  if (variant === "settings") {
    return (
      <div className="space-y-5">
        {items.map((item) => (
          <SettingsBudgetField
            key={item.label}
            label={item.label}
            hint={item.hint}
            budgetCents={item.budget}
            spentCents={item.spent}
            onSave={item.onSave}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-full gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex-1 min-w-0">
          <CompactBudgetBar
            label={item.label}
            budgetCents={item.budget}
            spentCents={item.spent}
            onSave={item.onSave}
          />
        </div>
      ))}
    </div>
  );
}
