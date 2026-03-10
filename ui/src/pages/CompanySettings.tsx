import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../components/PageSkeleton";
import { Settings } from "lucide-react";
import { HintIcon } from "../components/agent-config-primitives";
import { cn } from "../lib/utils";

export function CompanySettings() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
  }, [selectedCompany]);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

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

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "both",
        expiresInHours: 72,
      }),
    onSuccess: (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const absoluteUrl = invite.inviteUrl.startsWith("http")
        ? invite.inviteUrl
        : `${base}${invite.inviteUrl}`;
      setInviteLink(absoluteUrl);
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: (err) => {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite");
    },
  });
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
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your company profile, approvals, and preferences.</p>
      </div>

      {/* General */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          General
        </h2>
        <div className="space-y-4 rounded-xl border border-border px-4 py-4">
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
                className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setBrandColor("")}
                >
                  Clear
                </Button>
              )}
            </div>
          </SettingsField>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim()}
          >
            {generalMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-sm text-muted-foreground">Saved</span>
          )}
          {generalMutation.isError && (
            <span className="text-sm text-destructive">
              {generalMutation.error instanceof Error
                ? generalMutation.error.message
                : "Failed to save"}
            </span>
          )}
        </div>
      )}

      {/* Approvals */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Approvals
        </h2>
        <div className="space-y-4 rounded-xl border border-border px-4 py-4">
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
      </div>

      {/* Invites */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Invites
        </h2>
        <div className="space-y-3 rounded-xl border border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Generate a link to invite humans or agents to this company. Links expire after 72 hours.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? "Creating..." : "Create invite link"}
            </Button>
            {inviteLink && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                }}
              >
                Copy link
              </Button>
            )}
          </div>
          {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
          {inviteLink && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <span className="text-sm text-muted-foreground">Share link</span>
              <p className="mt-1 break-all font-mono text-sm">{inviteLink}</p>
            </div>
          )}
        </div>
      </div>

      {/* Knowledge */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Knowledge
        </h2>
        <div className="space-y-3 rounded-xl border border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
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
              {reindexMutation.isPending ? "Refreshing..." : "Refresh agent knowledge"}
            </Button>
            {reindexMutation.isSuccess && (
              <span className="text-sm text-muted-foreground">Refreshing — this may take a few minutes</span>
            )}
            {reindexMutation.isError && (
              <span className="text-sm text-destructive">
                {reindexMutation.error instanceof Error
                  ? reindexMutation.error.message
                  : "Something went wrong — please try again"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{label}</span>
        {hint && <HintIcon text={hint} />}
      </div>
      <button
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-green-600" : "bg-muted"
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}
