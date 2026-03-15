import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plug, Check, Loader2, Search, ChevronDown, ChevronUp, ExternalLink, Unplug, ShieldAlert, AlertTriangle, CreditCard } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { integrationsApi } from "../api/integrations";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ComposioToolkit } from "@substaff/shared";
import { agentsApi } from "../api/agents";
import { ConfirmDialog } from "../components/ConfirmDialog";

const INITIAL_PER_CATEGORY = 6;
const INTEGRATION_CONSENT_KEY = "substaff-integration-consent-acknowledged";

export function Integrations() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [oauthMessage, setOauthMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; name: string } | null>(null);
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingToolkit, setPendingToolkit] = useState<ComposioToolkit | null>(null);
  const [requiredFieldsDialog, setRequiredFieldsDialog] = useState<{
    toolkit: ComposioToolkit;
    fields: Array<{ name: string; displayName: string; description: string; type: string; required: boolean }>;
  } | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Handle OAuth redirect results
  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    if (oauthStatus === "success") {
      const provider = searchParams.get("provider") ?? "integration";
      setOauthMessage({ type: "success", text: `${provider} connected successfully.` });
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.list(selectedCompanyId!) });
      setSearchParams({}, { replace: true });
    } else if (oauthStatus === "error") {
      const message = searchParams.get("message") ?? "OAuth flow failed.";
      setOauthMessage({ type: "error", text: message });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient, selectedCompanyId]);

  useEffect(() => {
    if (!oauthMessage) return;
    const timer = setTimeout(() => setOauthMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [oauthMessage]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Integrations" }]);
  }, [setBreadcrumbs]);

  const { data: availableApps, isLoading: appsLoading } = useQuery({
    queryKey: queryKeys.integrations.available(selectedCompanyId!),
    queryFn: () => integrationsApi.available(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: connections, isLoading: connsLoading } = useQuery({
    queryKey: queryKeys.integrations.list(selectedCompanyId!),
    queryFn: () => integrationsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const disconnectMutation = useMutation({
    mutationFn: (connectionId: string) => integrationsApi.disconnect(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.list(selectedCompanyId!) });
    },
  });

  const performConnect = useCallback(
    async (toolkit: ComposioToolkit, connectionParams?: Record<string, unknown>) => {
      if (!selectedCompanyId) return;
      setConnectingApp(toolkit.slug);
      try {
        const result = await integrationsApi.connect(selectedCompanyId, {
          appName: toolkit.slug,
          ...(connectionParams ? { connectionParams } : {}),
        });

        if (result.connectionStatus === "REQUIRES_INPUT" && result.requiredFields?.length) {
          // Show a dialog to collect required fields from the user
          setRequiredFieldsDialog({ toolkit, fields: result.requiredFields });
          setFieldValues({});
          return;
        }

        if (result.redirectUrl) {
          window.location.href = result.redirectUrl;
        } else {
          queryClient.invalidateQueries({ queryKey: queryKeys.integrations.list(selectedCompanyId) });
          setOauthMessage({ type: "success", text: `${toolkit.name} connected successfully.` });
        }
      } catch (err) {
        setOauthMessage({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to initiate connection",
        });
      } finally {
        setConnectingApp(null);
      }
    },
    [selectedCompanyId, queryClient],
  );

  const handleRequiredFieldsSubmit = useCallback(() => {
    if (!requiredFieldsDialog) return;
    const { toolkit, fields } = requiredFieldsDialog;
    // Validate all required fields have values
    const missing = fields.filter((f) => f.required && !fieldValues[f.name]?.trim());
    if (missing.length > 0) return;
    setRequiredFieldsDialog(null);
    performConnect(toolkit, fieldValues);
  }, [requiredFieldsDialog, fieldValues, performConnect]);

  const handleConnect = useCallback(
    (toolkit: ComposioToolkit) => {
      // Show consent dialog for first-ever connection if not previously acknowledged
      const hasConnections = (connections ?? []).length > 0;
      let consentAcknowledged = false;
      try { consentAcknowledged = localStorage.getItem(INTEGRATION_CONSENT_KEY) === "true"; } catch { /* */ }

      if (!hasConnections && !consentAcknowledged) {
        setPendingToolkit(toolkit);
        setConsentOpen(true);
        return;
      }

      performConnect(toolkit);
    },
    [connections, performConnect],
  );

  const handleConsentAccept = useCallback(() => {
    try { localStorage.setItem(INTEGRATION_CONSENT_KEY, "true"); } catch { /* */ }
    setConsentOpen(false);
    if (pendingToolkit) {
      performConnect(pendingToolkit);
      setPendingToolkit(null);
    }
  }, [pendingToolkit, performConnect]);

  const handleConsentCancel = useCallback(() => {
    setConsentOpen(false);
    setPendingToolkit(null);
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">Select a company</div>;
  }

  if (appsLoading || connsLoading) {
    return <PageSkeleton variant="integrations" />;
  }

  const connectedProviders = new Set((connections ?? []).map((c) => c.provider));
  const connectionByProvider = new Map(
    (connections ?? []).map((c) => [c.provider, c]),
  );

  const allToolkits = (availableApps ?? []).filter((t): t is ComposioToolkit => !!t?.slug);

  // Connected toolkits from connections
  const connectedToolkits: ComposioToolkit[] = (connections ?? [])
    .filter((c) => c.toolkit)
    .map((c) => c.toolkit!);

  const availableForConnect = allToolkits.filter((t) => !connectedProviders.has(t.slug));

  const isSearching = search.trim().length > 0;
  const filteredAvailable = isSearching
    ? availableForConnect.filter(
        (t) =>
          t.name?.toLowerCase().includes(search.toLowerCase()) ||
          t.meta?.description?.toLowerCase().includes(search.toLowerCase()) ||
          t.meta?.categories?.some((c) => (typeof c === "string" ? c : c?.name ?? "").toLowerCase().includes(search.toLowerCase())),
      )
    : availableForConnect;

  // Group available by category
  const categoryOrder = ["Development", "Productivity", "Communication", "Marketing", "CRM", "Other"];
  const grouped = new Map<string, ComposioToolkit[]>();
  for (const toolkit of filteredAvailable) {
    const firstCat = toolkit.meta?.categories?.[0];
    const cat = (typeof firstCat === "string" ? firstCat : firstCat?.name) ?? "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(toolkit);
  }
  const sortedCategories = [...grouped.keys()].sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  function renderConnectedCard(toolkit: ComposioToolkit) {
    const conn = connectionByProvider.get(toolkit.slug);

    const assigned = agents?.filter(
      (a) => a.integrations && a.integrations.includes(toolkit.slug) && a.status !== "terminated",
    ) ?? [];
    const rootDefault = agents?.filter(
      (a) => !a.reportsTo && (!a.integrations || a.integrations.length === 0) && a.status !== "terminated",
    ) ?? [];
    const allAgents = [...assigned, ...rootDefault];

    return (
      <div
        key={toolkit.slug}
        className="group relative rounded-lg border border-emerald-500/30 bg-card p-4 transition-all hover:border-emerald-500/50 hover:shadow-sm"
      >
        {/* Green accent line */}
        <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-lg bg-emerald-500/60" />

        <div className="flex items-start gap-3">
          {/* Logo */}
          <div className="relative shrink-0">
            {toolkit.meta?.logo ? (
              <img
                src={toolkit.meta.logo}
                alt=""
                className="h-10 w-10 rounded-lg object-contain bg-background p-1 border border-border/50"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  el.parentElement?.querySelector("[data-logo-fallback]")?.classList.remove("hidden");
                }}
              />
            ) : null}
            <div
              data-logo-fallback
              className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center${toolkit.meta?.logo ? " hidden" : ""}`}
            >
              <Plug className="h-4 w-4 text-muted-foreground" />
            </div>
            {/* Status dot */}
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold truncate">{toolkit.name}</span>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] shrink-0">
                <Check className="h-2.5 w-2.5" />
                Connected
              </Badge>
            </div>

            {toolkit.meta?.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {toolkit.meta.description}
              </p>
            )}

            {toolkit.meta?.categories && toolkit.meta.categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {toolkit.meta.categories.map((cat, i) => {
                  const label = typeof cat === "string" ? cat : cat?.name ?? cat?.slug ?? "";
                  const key = typeof cat === "string" ? cat : cat?.slug ?? String(i);
                  if (!label) return null;
                  return (
                    <span
                      key={key}
                      className="inline-flex rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Agents section */}
            {allAgents.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Agents</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {assigned.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                    >
                      {a.name}
                    </span>
                  ))}
                  {rootDefault.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {a.name} (all)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Disconnect */}
            <div className="mt-3 flex items-center">
              {conn && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1.5 -ml-2"
                  disabled={disconnectMutation.isPending}
                  onClick={() => setDisconnectTarget({ id: conn.id, name: toolkit.name })}
                >
                  <Unplug className="h-3 w-3" />
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderAvailableCard(toolkit: ComposioToolkit, index: number) {
    return (
      <div
        key={toolkit.slug}
        className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm animate-fade-up"
        style={{ animationDelay: `${Math.min(index * 30, 180)}ms` }}
      >
        <div className="flex items-start gap-3">
          {/* Logo */}
          {toolkit.meta?.logo ? (
            <img
              src={toolkit.meta.logo}
              alt=""
              className="h-10 w-10 rounded-lg shrink-0 object-contain bg-background p-1 border border-border/50"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                el.parentElement?.querySelector("[data-logo-fallback]")?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div
            data-logo-fallback
            className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0${toolkit.meta?.logo ? " hidden" : ""}`}
          >
            <Plug className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold">{toolkit.name}</span>
            {toolkit.meta?.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {toolkit.meta.description}
              </p>
            )}

            {toolkit.meta?.categories && toolkit.meta.categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {toolkit.meta.categories.map((cat, i) => {
                  const label = typeof cat === "string" ? cat : cat?.name ?? cat?.slug ?? "";
                  const key = typeof cat === "string" ? cat : cat?.slug ?? String(i);
                  if (!label) return null;
                  return (
                    <span
                      key={key}
                      className="inline-flex rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
                disabled={connectingApp === toolkit.slug}
                onClick={() => handleConnect(toolkit)}
              >
                {connectingApp === toolkit.slug ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-3 w-3" />
                    Connect
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external tools so your agents can deliver work directly.
        </p>
      </div>

      {/* OAuth message */}
      {oauthMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm animate-fade-up ${
            oauthMessage.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}
        >
          {oauthMessage.text}
        </div>
      )}

      {/* Connected section */}
      {connectedToolkits.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Connected
            </h2>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
              {connectedToolkits.length}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {connectedToolkits.map((tk) => renderConnectedCard(tk))}
          </div>
        </section>
      )}

      {/* Available section */}
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Available
            </h2>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
              {filteredAvailable.length}
            </Badge>
          </div>

          {availableForConnect.length > 6 && (
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search integrations…"
                className="h-8 pl-9 text-xs"
              />
            </div>
          )}
        </div>

        {sortedCategories.map((cat) => {
          const items = grouped.get(cat)!;
          const isExpanded = isSearching || expandedCategories.has(cat);
          const visible = isExpanded ? items : items.slice(0, INITIAL_PER_CATEGORY);
          const hiddenCount = items.length - INITIAL_PER_CATEGORY;

          return (
            <div key={cat} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {cat}
                </h3>
                <span className="text-[10px] text-muted-foreground/60">{items.length}</span>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((tk, i) => renderAvailableCard(tk, i))}
              </div>
              {!isSearching && hiddenCount > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                  onClick={() => toggleCategory(cat)}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show {hiddenCount} more
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}

        {filteredAvailable.length === 0 && isSearching && (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <Search className="mx-auto h-5 w-5 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No integrations matching &ldquo;{search}&rdquo;
            </p>
          </div>
        )}
      </section>

      {allToolkits.length === 0 && connectedToolkits.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Plug className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No integrations available</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set COMPOSIO_API_KEY to enable integrations.
          </p>
        </div>
      )}

      {/* ── Required fields dialog (e.g. Shopify store subdomain) ── */}
      <Dialog open={!!requiredFieldsDialog} onOpenChange={(open) => { if (!open) setRequiredFieldsDialog(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {requiredFieldsDialog?.toolkit.name} — additional info needed
            </DialogTitle>
            <DialogDescription>
              This integration requires the following information to connect.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {requiredFieldsDialog?.fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <label htmlFor={`field-${field.name}`} className="text-sm font-medium">
                  {field.displayName}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </label>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
                <Input
                  id={`field-${field.name}`}
                  value={fieldValues[field.name] ?? ""}
                  onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  placeholder={field.displayName}
                  className="h-9"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRequiredFieldsDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRequiredFieldsSubmit}
              disabled={
                requiredFieldsDialog?.fields.some((f) => f.required && !fieldValues[f.name]?.trim()) ?? true
              }
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── First-connection consent dialog ── */}
      <Dialog open={consentOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-[420px] p-0 gap-0 overflow-hidden">
          {/* Hero section */}
          <div className="relative px-8 pt-10 pb-6 text-center">
            {/* Warning gradient accent */}
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-amber-500/[0.08] to-transparent pointer-events-none" />

            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
                <ShieldAlert className="h-7 w-7 text-amber-500" />
              </div>
              <DialogHeader className="space-y-2">
                <DialogTitle className="text-center text-lg">
                  Before you connect
                </DialogTitle>
                <DialogDescription className="text-center text-sm leading-relaxed max-w-[320px] mx-auto">
                  Connecting an integration grants your AI agents access to that service on your behalf. Please review the following before proceeding.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          {/* Warning items */}
          <div className="px-6 pb-2">
            <div className="space-y-1">
              <ConsentWarningRow
                icon={<ShieldAlert className="h-4 w-4" />}
                iconBg="bg-amber-500/10 text-amber-500"
                title="Full account access"
                description="Agents may gain broad permissions to read, write, and modify data in the connected service."
              />
              <ConsentWarningRow
                icon={<AlertTriangle className="h-4 w-4" />}
                iconBg="bg-red-500/10 text-red-500"
                title="Unintended actions"
                description="Autonomous agents can take actions you didn't anticipate, including destructive or irreversible changes."
              />
              <ConsentWarningRow
                icon={<CreditCard className="h-4 w-4" />}
                iconBg="bg-orange-500/10 text-orange-500"
                title="Financial risk"
                description="If the connected service can trigger purchases, subscriptions, or payments, agents could incur real costs."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="px-8 pb-8 pt-4 flex flex-col gap-2.5">
            <Button size="lg" className="w-full" onClick={handleConsentAccept}>
              I understand, continue
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={handleConsentCancel}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}
        title="Disconnect integration"
        description={`Are you sure you want to disconnect ${disconnectTarget?.name ?? "this integration"}?`}
        confirmLabel="Disconnect"
        variant="destructive"
        onConfirm={() => {
          if (disconnectTarget) disconnectMutation.mutate(disconnectTarget.id);
          setDisconnectTarget(null);
        }}
      />
    </div>
  );
}

function ConsentWarningRow({
  icon,
  iconBg,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium leading-none">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
