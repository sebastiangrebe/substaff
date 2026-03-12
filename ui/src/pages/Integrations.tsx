import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plug, Check, Loader2, Search, ChevronDown } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { integrationsApi } from "../api/integrations";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import type { ComposioToolkit } from "@substaff/shared";
import { agentsApi } from "../api/agents";
import { ConfirmDialog } from "../components/ConfirmDialog";

const INITIAL_PER_CATEGORY = 6;

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

  const handleConnect = useCallback(
    async (toolkit: ComposioToolkit) => {
      if (!selectedCompanyId) return;
      setConnectingApp(toolkit.slug);
      try {
        const result = await integrationsApi.connect(selectedCompanyId, {
          appName: toolkit.slug,
        });
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

  function renderCard(toolkit: ComposioToolkit, isConnected: boolean) {
    const conn = connectionByProvider.get(toolkit.slug);

    return (
      <div
        key={toolkit.slug}
        className={`rounded-xl border px-4 py-4 transition-colors ${
          isConnected
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <div className="flex items-start gap-3">
          {toolkit.meta?.logo ? (
            <img
              src={toolkit.meta.logo}
              alt=""
              className="h-8 w-8 rounded-md shrink-0 mt-0.5 object-contain"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                el.parentElement?.querySelector("[data-logo-fallback]")?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div
            data-logo-fallback
            className={`h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5${toolkit.meta?.logo ? " hidden" : ""}`}
          >
            <Plug className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{toolkit.name}</span>
              {isConnected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                  <Check className="h-3 w-3" />
                  Connected
                </span>
              )}
            </div>
            {toolkit.meta?.description && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {toolkit.meta.description}
              </p>
            )}
            {toolkit.meta?.categories && toolkit.meta.categories.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {toolkit.meta.categories.map((cat, i) => {
                  const label = typeof cat === "string" ? cat : cat?.name ?? cat?.slug ?? "";
                  const key = typeof cat === "string" ? cat : cat?.slug ?? String(i);
                  if (!label) return null;
                  return (
                    <span
                      key={key}
                      className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="mt-2.5 flex items-center gap-2">
              {isConnected && conn ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={disconnectMutation.isPending}
                  onClick={() => setDisconnectTarget({ id: conn.id, name: toolkit.name })}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="text-xs"
                  disabled={connectingApp === toolkit.slug}
                  onClick={() => handleConnect(toolkit)}
                >
                  {connectingApp === toolkit.slug ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
              )}
            </div>
            {isConnected && agents && (() => {
              const assigned = agents.filter(
                (a) => a.integrations && a.integrations.includes(toolkit.slug) && a.status !== "terminated",
              );
              const rootDefault = agents.filter(
                (a) => !a.reportsTo && (!a.integrations || a.integrations.length === 0) && a.status !== "terminated",
              );
              return (assigned.length > 0 || rootDefault.length > 0) ? (
                <div className="mt-2.5 pt-2.5 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground">Agents:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {assigned.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                      >
                        {a.name}
                      </span>
                    ))}
                    {rootDefault.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {a.name} (all)
                      </span>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external tools so your agents can deliver work directly.
        </p>
      </div>

      {oauthMessage && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            oauthMessage.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700"
              : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}
        >
          {oauthMessage.text}
        </div>
      )}

      {/* Connected */}
      {connectedToolkits.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Connected ({connectedToolkits.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {connectedToolkits.map((tk) => renderCard(tk, true))}
          </div>
        </div>
      )}

      {/* Available */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Available
        </h2>
        {availableForConnect.length > 6 && (
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search integrations..."
              className="w-full rounded-md border border-border bg-transparent pl-8 pr-3 py-1.5 text-sm outline-none focus-visible:ring-ring focus-visible:ring-[3px]"
            />
          </div>
        )}

        {sortedCategories.map((cat) => {
          const items = grouped.get(cat)!;
          const isExpanded = isSearching || expandedCategories.has(cat);
          const visible = isExpanded ? items : items.slice(0, INITIAL_PER_CATEGORY);
          const hiddenCount = items.length - INITIAL_PER_CATEGORY;

          return (
            <div key={cat} className="space-y-2.5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {cat} ({items.length})
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((tk) => renderCard(tk, false))}
              </div>
              {!isSearching && hiddenCount > 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => toggleCategory(cat)}
                >
                  {isExpanded ? (
                    "Show less"
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
          <p className="text-sm text-muted-foreground py-4 text-center">
            No integrations matching &ldquo;{search}&rdquo;
          </p>
        )}
      </div>

      {allToolkits.length === 0 && connectedToolkits.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No integrations available yet. Set COMPOSIO_API_KEY to enable integrations.
        </div>
      )}

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
