import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkingHoursConfig } from "@substaff/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { HintIcon } from "../components/agent-config-primitives";
import { WorkingHoursEditor } from "../components/WorkingHoursEditor";
import { cn } from "../lib/utils";
import {
  Settings2,
  ShieldCheck,
  Clock,
  Brain,
  Palette,
  Building2,
  Check,
  RefreshCw,
} from "lucide-react";

export function CompanySettings() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");

  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
  }, [selectedCompany]);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: { name: string; description: string | null; brandColor: string | null }) =>
      companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const hireApprovalMutation = useMutation({
    mutationFn: (requireHireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, { requireHireApproval }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const planApprovalMutation = useMutation({
    mutationFn: (requirePlanApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, { requirePlanApproval }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const [localWorkingHours, setLocalWorkingHours] = useState<WorkingHoursConfig | null>(
    (selectedCompany?.workingHours as WorkingHoursConfig | null) ?? null,
  );
  const workingHoursDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local working hours when switching companies
  useEffect(() => {
    if (!selectedCompany) return;
    setLocalWorkingHours((selectedCompany.workingHours as WorkingHoursConfig | null) ?? null);
  }, [selectedCompany?.id]);

  const workingHoursMutation = useMutation({
    mutationFn: (workingHours: WorkingHoursConfig | null) =>
      companiesApi.update(selectedCompanyId!, { workingHours }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const handleWorkingHoursChange = useCallback(
    (wh: WorkingHoursConfig | null) => {
      setLocalWorkingHours(wh);
      if (workingHoursDebounceRef.current) clearTimeout(workingHoursDebounceRef.current);
      workingHoursDebounceRef.current = setTimeout(() => {
        workingHoursMutation.mutate(wh);
      }, 600);
    },
    [workingHoursMutation],
  );

  const reindexMutation = useMutation({
    mutationFn: () =>
      api.post(`/companies/${selectedCompanyId}/knowledge/reindex-all`, {}),
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Settings" }]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null,
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your company profile, approvals, and preferences.
        </p>
      </div>

      {/* ── General ── */}
      <SettingsSection icon={Building2} title="General" description="Company profile and branding.">
        <div className="space-y-5">
          <SettingsField label="Company name" hint="The display name for your company.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </SettingsField>
          <SettingsField label="Description" hint="Optional description shown in the company profile.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
              type="text"
              value={description}
              placeholder="Optional company description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </SettingsField>
          <SettingsField label="Color" hint="Sets the hue for the company icon. Leave empty for auto-generated color.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor || "#6366f1"}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0"
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                    setBrandColor(v);
                  }
                }}
                placeholder="Auto"
                className="w-28 rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
              />
              {brandColor && (
                <Button size="sm" variant="ghost" onClick={() => setBrandColor("")}>
                  Clear
                </Button>
              )}
            </div>
          </SettingsField>
        </div>

        {/* Save bar */}
        {generalDirty && (
          <div className="flex items-center gap-2 pt-4 mt-4 border-t border-border/50">
            <Button
              size="sm"
              onClick={handleSaveGeneral}
              disabled={generalMutation.isPending || !companyName.trim()}
            >
              {generalMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
            <MutationFeedback mutation={generalMutation} successMessage="Saved" />
          </div>
        )}
      </SettingsSection>

      {/* ── Approvals ── */}
      <SettingsSection icon={ShieldCheck} title="Approvals" description="Control governance and review requirements.">
        <div className="space-y-0 divide-y divide-border/50">
          <SettingsToggle
            label="Require board approval for new hires"
            hint="New agent hires stay pending until approved by board."
            checked={!!selectedCompany.requireHireApproval}
            onChange={(v) => hireApprovalMutation.mutate(v)}
          />
          <SettingsToggle
            label="Require plan approval before execution"
            hint="Agents must submit a plan and get board approval before executing tasks."
            checked={!!selectedCompany.requirePlanApproval}
            onChange={(v) => planApprovalMutation.mutate(v)}
          />
        </div>
      </SettingsSection>

      {/* ── Working Hours ── */}
      <SettingsSection icon={Clock} title="Working Hours" description="Define when agents are allowed to run automatic heartbeat sessions.">
        <p className="text-xs text-muted-foreground mb-3">
          Manual triggers, ticket responses, and approvals still work outside working hours.
        </p>
        <WorkingHoursEditor
          value={localWorkingHours}
          onChange={handleWorkingHoursChange}
        />
        {workingHoursMutation.isError && (
          <span className="text-sm text-destructive mt-2 block">
            {workingHoursMutation.error instanceof Error
              ? workingHoursMutation.error.message
              : "Failed to save"}
          </span>
        )}
      </SettingsSection>

      {/* ── Knowledge (hidden for now) ── */}
      {false && (
      <SettingsSection icon={Brain} title="Knowledge" description="Manage your agents' knowledge base.">
        <p className="text-xs text-muted-foreground mb-3">
          Rebuild what your agents know by re-processing all comments and files.
          Runs in the background — may take a few minutes for larger workspaces.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => reindexMutation.mutate()}
            disabled={reindexMutation.isPending}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", reindexMutation.isPending && "animate-spin")} />
            {reindexMutation.isPending ? "Refreshing..." : "Refresh agent knowledge"}
          </Button>
          <MutationFeedback
            mutation={reindexMutation}
            successMessage="Refreshing — this may take a few minutes"
          />
        </div>
      </SettingsSection>
      )}
    </div>
  );
}

/* ── Settings Section wrapper ── */

import type { LucideIcon } from "lucide-react";

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {description && (
          <>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card px-5 py-5">
        {children}
      </div>
    </div>
  );
}

/* ── Settings Field ── */

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-sm font-medium">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      {children}
    </div>
  );
}

/* ── Settings Toggle ── */

function SettingsToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm">{label}</span>
        {hint && <HintIcon text={hint} />}
      </div>
      <button
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-4",
          checked ? "bg-primary" : "bg-muted"
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

/* ── Mutation Feedback inline ── */

function MutationFeedback({
  mutation,
  successMessage = "Saved",
}: {
  mutation: { isSuccess: boolean; isError: boolean; error: unknown };
  successMessage?: string;
}) {
  if (mutation.isSuccess) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3 w-3" />
        {successMessage}
      </span>
    );
  }
  if (mutation.isError) {
    return (
      <span className="text-xs text-destructive">
        {mutation.error instanceof Error ? mutation.error.message : "Failed to save"}
      </span>
    );
  }
  return null;
}
