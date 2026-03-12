import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plug, Check, X, ExternalLink, Loader2, Plus, KeyRound, Search } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { integrationsApi } from "../api/integrations";
import { secretsApi } from "../api/secrets";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import type { McpServerDefinition, CompanySecret } from "@substaff/shared";
import { agentsApi } from "../api/agents";
import { ConfirmDialog } from "../components/ConfirmDialog";

/** Slugs that support OAuth-based connection (browser redirect flow) */
const OAUTH_SLUGS = new Set(["google-drive", "meta", "tiktok"]);

/** Per-env-key state: either pick an existing secret or create a new one inline */
type KeyEntry = { mode: "select"; secretId: string } | { mode: "create"; value: string };

/** Setup guides keyed by MCP server definition slug */
const SETUP_GUIDES: Record<string, { steps: string[]; linkLabel: string; linkUrl: string }> = {
  github: {
    steps: [
      "Go to GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens",
      "Click \"Generate new token\"",
      "Give it a name (e.g. \"Substaff agents\") and set an expiration",
      "Under Repository access, select the repos your agents should access",
      "Under Permissions, grant: Contents (Read & Write), Pull requests (Read & Write), Issues (Read & Write)",
      "Click \"Generate token\" and copy the value",
    ],
    linkLabel: "GitHub token settings",
    linkUrl: "https://github.com/settings/tokens?type=beta",
  },
  slack: {
    steps: [
      "Go to api.slack.com/apps and create a new app (or select an existing one)",
      "Go to OAuth & Permissions in the sidebar",
      "Under Bot Token Scopes, add: chat:write, channels:read, channels:history, users:read",
      "Click \"Install to Workspace\" and authorize",
      "Copy the Bot User OAuth Token (starts with xoxb-)",
    ],
    linkLabel: "Slack app dashboard",
    linkUrl: "https://api.slack.com/apps",
  },
  "google-drive": {
    steps: [
      "Go to the Google Cloud Console and create or select a project",
      "Enable the Google Drive API and Google Docs API under APIs & Services > Library",
      "Go to APIs & Services > Credentials, click \"Create Credentials\" > \"OAuth client ID\"",
      "Choose application type \"Web application\" and add the Substaff callback URL as an authorized redirect URI",
      "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET env vars on the server",
      "Click \"Connect with Google\" below — you'll be redirected to authorize access",
    ],
    linkLabel: "Google Cloud Console",
    linkUrl: "https://console.cloud.google.com/apis/credentials",
  },
  linear: {
    steps: [
      "Go to Linear Settings > API (or click the link below)",
      "Under Personal API keys, click \"Create key\"",
      "Give it a label (e.g. \"Substaff agents\")",
      "Copy the generated API key",
    ],
    linkLabel: "Linear API settings",
    linkUrl: "https://linear.app/settings/api",
  },
  notion: {
    steps: [
      "Go to notion.so/my-integrations and click \"New integration\"",
      "Give it a name (e.g. \"Substaff agents\") and select the workspace",
      "Under Capabilities, enable: Read content, Update content, Insert content",
      "Click Submit and copy the Internal Integration Secret",
      "In Notion, share each page/database with your integration via the \"...\" menu > Connections",
    ],
    linkLabel: "Notion integrations",
    linkUrl: "https://www.notion.so/my-integrations",
  },
  meta: {
    steps: [
      "Go to developers.facebook.com → \"My Apps\" → \"Create App\"",
      "Select \"Business\" app type",
      "Add \"Facebook Login for Business\" product",
      "Go to Settings → Basic, copy App ID and App Secret",
      "Set server env vars: META_OAUTH_APP_ID and META_OAUTH_APP_SECRET",
      "In Facebook Login → Settings, add OAuth redirect URI: {your-server-url}/api/integrations/oauth/meta/callback",
      "Under App Review → Permissions, request: pages_manage_posts, instagram_content_publish, ads_management, whatsapp_business_management",
      "Click \"Connect with Meta\" below to authorize",
    ],
    linkLabel: "Meta for Developers",
    linkUrl: "https://developers.facebook.com/apps/",
  },
  tiktok: {
    steps: [
      "Go to developers.tiktok.com → \"Manage apps\" → \"Connect an app\"",
      "Select app type and fill in app details",
      "Add products: \"Login Kit\" and \"Content Posting API\"",
      "In Login Kit settings, add redirect URI: {your-server-url}/api/integrations/oauth/tiktok/callback",
      "Set server env vars: TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET",
      "Request scopes: video.publish, video.upload, user.info.basic, video.list",
      "Submit app for audit (required for public posting — until then, posts are private only)",
      "Click \"Connect with TikTok\" below to authorize",
    ],
    linkLabel: "TikTok for Developers",
    linkUrl: "https://developers.tiktok.com/",
  },
};

function ConnectDialog({
  definition,
  secrets,
  companyId,
  onClose,
}: {
  definition: McpServerDefinition;
  secrets: CompanySecret[];
  companyId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const allEnvKeys = [...definition.requiredEnvKeys, ...definition.optionalEnvKeys];

  // Initialise: if no secrets exist, default to "create" mode for required keys
  const [entries, setEntries] = useState<Record<string, KeyEntry>>(() => {
    const init: Record<string, KeyEntry> = {};
    for (const key of definition.requiredEnvKeys) {
      init[key] = secrets.length === 0 ? { mode: "create", value: "" } : { mode: "select", secretId: "" };
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const guide = SETUP_GUIDES[definition.slug];

  function updateEntry(key: string, entry: KeyEntry) {
    setEntries((prev) => ({ ...prev, [key]: entry }));
  }

  const allRequiredFilled = definition.requiredEnvKeys.every((key) => {
    const e = entries[key];
    if (!e) return false;
    return e.mode === "select" ? !!e.secretId : e.value.trim().length > 0;
  });

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const credentialSecretIds: Record<string, string> = {};

      // Create any inline secrets first
      for (const key of allEnvKeys) {
        const e = entries[key];
        if (!e) continue;

        if (e.mode === "create" && e.value.trim()) {
          const secretName = `${definition.slug}/${key}`;
          let secretId: string;
          try {
            const created = await secretsApi.create(companyId, {
              name: secretName,
              value: e.value.trim(),
              description: `Auto-created for ${definition.displayName} integration`,
            });
            secretId = created.id;
          } catch (createErr) {
            // Secret with this name already exists (409) — rotate it with the new value
            const allSecrets = await secretsApi.list(companyId);
            const existing = allSecrets.find((s) => s.name === secretName);
            if (!existing) throw createErr;
            const rotated = await secretsApi.rotate(existing.id, { value: e.value.trim() });
            secretId = rotated.id;
          }
          credentialSecretIds[key] = secretId;
        } else if (e.mode === "select" && e.secretId) {
          credentialSecretIds[key] = e.secretId;
        }
      }

      await integrationsApi.connect(companyId, {
        definitionId: definition.id,
        credentialSecretIds,
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.list(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(companyId) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setBusy(false);
    }
  }

  function renderKeyField(key: string, required: boolean) {
    const entry = entries[key];
    const isCreate = entry?.mode === "create";
    const isSelect = !entry || entry.mode === "select";

    return (
      <div key={key}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            {key}
            {!required && <span className="ml-1 text-muted-foreground/60">(optional)</span>}
          </label>
          {secrets.length > 0 && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() =>
                updateEntry(
                  key,
                  isCreate
                    ? { mode: "select", secretId: "" }
                    : { mode: "create", value: "" },
                )
              }
            >
              {isCreate ? (
                <>
                  <KeyRound className="h-3 w-3" />
                  Use existing secret
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  Create new
                </>
              )}
            </button>
          )}
        </div>

        {isSelect && secrets.length > 0 ? (
          <select
            className="mt-1 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            value={(entry as { mode: "select"; secretId: string })?.secretId ?? ""}
            onChange={(e) => updateEntry(key, { mode: "select", secretId: e.target.value })}
          >
            <option value="">Select a secret...</option>
            {secrets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none font-mono"
            placeholder={`Paste your ${key} value...`}
            value={(entry as { mode: "create"; value: string })?.value ?? ""}
            onChange={(e) => updateEntry(key, { mode: "create", value: e.target.value })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Connect {definition.displayName}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{definition.description}</p>

        {guide && (
          <div className="mt-3 rounded-md border border-border bg-muted/30 text-xs">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setGuideOpen((v) => !v)}
            >
              <span>How to get your credentials</span>
              <span className="text-[10px]">{guideOpen ? "Hide" : "Show"}</span>
            </button>
            {guideOpen && (
              <div className="border-t border-border px-3 pb-3 pt-2 space-y-1.5">
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed">
                  {guide.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <a
                  href={guide.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-foreground hover:underline mt-1"
                >
                  {guide.linkLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {definition.requiredEnvKeys.map((key) => renderKeyField(key, true))}
          {definition.optionalEnvKeys.length > 0 && (
            <>
              <div className="border-t border-border pt-2 text-xs text-muted-foreground">Optional</div>
              {definition.optionalEnvKeys.map((key) => renderKeyField(key, false))}
            </>
          )}
        </div>

        {secrets.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Credentials will be stored as encrypted secrets in your company vault.
          </p>
        )}

        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!allRequiredFilled || busy}
            onClick={handleConnect}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

const SLUG_ICONS: Record<string, string> = {
  github: "https://github.githubassets.com/favicons/favicon.svg",
  slack: "https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png",
  linear: "https://linear.app/favicon.ico",
  notion: "https://www.notion.so/images/favicon.ico",
  "google-drive": "https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png",
  meta: "https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png",
  tiktok: "https://sf-tb-sg.ibytedtos.com/obj/eden-sg/uhtyvueh7nulogpoguhm/tiktok-icon2.png",
};

export function Integrations() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [connectDef, setConnectDef] = useState<McpServerDefinition | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [oauthMessage, setOauthMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; name: string } | null>(null);

  // Handle OAuth redirect results (query params set by the callback redirect)
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

  // Auto-dismiss oauth message after 8 seconds
  useEffect(() => {
    if (!oauthMessage) return;
    const timer = setTimeout(() => setOauthMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [oauthMessage]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Integrations" }]);
  }, [setBreadcrumbs]);

  const { data: definitions, isLoading: defsLoading } = useQuery({
    queryKey: queryKeys.integrations.definitions(selectedCompanyId!),
    queryFn: () => integrationsApi.definitions(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: connections, isLoading: connsLoading } = useQuery({
    queryKey: queryKeys.integrations.list(selectedCompanyId!),
    queryFn: () => integrationsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: secrets } = useQuery({
    queryKey: queryKeys.secrets.list(selectedCompanyId!),
    queryFn: () => secretsApi.list(selectedCompanyId!),
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
    (def: McpServerDefinition) => {
      if (OAUTH_SLUGS.has(def.slug) && selectedCompanyId) {
        // OAuth flow: redirect the browser to the server's authorize endpoint
        window.location.href = integrationsApi.oauthAuthorizeUrl(def.slug, selectedCompanyId);
      } else {
        // API key flow: show the credential paste dialog
        setConnectDef(def);
      }
    },
    [selectedCompanyId],
  );

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">Select a company</div>;
  }

  if (defsLoading || connsLoading) {
    return <PageSkeleton variant="integrations" />;
  }

  const connectedSlugs = new Set((connections ?? []).map((c) => c.provider));
  const connectionBySlug = new Map(
    (connections ?? []).map((c) => [c.provider, c]),
  );

  const allDefs = definitions ?? [];
  const connectedDefs = allDefs.filter((d) => connectedSlugs.has(d.slug));
  const availableDefs = allDefs.filter((d) => !connectedSlugs.has(d.slug));

  const SLUG_CATEGORIES: Record<string, string> = {
    github: "Development",
    linear: "Development",
    notion: "Productivity",
    slack: "Communication",
    "google-drive": "Productivity",
    meta: "Marketing",
    tiktok: "Marketing",
  };

  const filteredAvailable = search.trim()
    ? availableDefs.filter(
        (d) =>
          d.displayName.toLowerCase().includes(search.toLowerCase()) ||
          d.description.toLowerCase().includes(search.toLowerCase()) ||
          (SLUG_CATEGORIES[d.slug] ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : availableDefs;

  // Group available by category
  const categoryOrder = ["Development", "Productivity", "Communication", "Marketing", "Other"];
  const grouped = new Map<string, McpServerDefinition[]>();
  for (const def of filteredAvailable) {
    const cat = SLUG_CATEGORIES[def.slug] ?? "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(def);
  }
  const sortedCategories = categoryOrder.filter((c) => grouped.has(c));

  function renderCard(def: McpServerDefinition, isConnected: boolean) {
    const conn = connectionBySlug.get(def.slug);
    const iconUrl = def.iconUrl || SLUG_ICONS[def.slug];
    const isOAuth = OAUTH_SLUGS.has(def.slug);

    return (
      <div
        key={def.id}
        className={`rounded-xl border px-4 py-4 transition-colors ${
          isConnected
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <div className="flex items-start gap-3">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="h-8 w-8 rounded-md shrink-0 mt-0.5" />
          ) : (
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Plug className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{def.displayName}</span>
              {isConnected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                  <Check className="h-3 w-3" />
                  Connected
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {def.description}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              {isConnected && conn ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={disconnectMutation.isPending}
                  onClick={() => setDisconnectTarget({ id: conn.id, name: def.displayName })}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={() => handleConnect(def)}
                >
                  {isOAuth
                    ? `Connect with ${def.slug === "google-drive" ? "Google" : def.slug === "meta" ? "Meta" : def.slug === "tiktok" ? "TikTok" : def.displayName}`
                    : "Connect"}
                </Button>
              )}
              {def.documentationUrl && (
                <a
                  href={def.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  Docs
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {isConnected && agents && (() => {
              const assigned = agents.filter(
                (a) => a.integrations && a.integrations.includes(def.slug) && a.status !== "terminated",
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
      {connectedDefs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground ">
            Connected ({connectedDefs.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {connectedDefs.map((def) => renderCard(def, true))}
          </div>
        </div>
      )}

      {/* Available */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground ">
          Available
        </h2>
        {availableDefs.length > 4 && (
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

        {sortedCategories.map((cat) => (
          <div key={cat} className="space-y-2.5">
            <h3 className="text-xs font-medium text-muted-foreground">{cat}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.get(cat)!.map((def) => renderCard(def, false))}
            </div>
          </div>
        ))}

        {filteredAvailable.length === 0 && search.trim() && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No integrations matching "{search}"
          </p>
        )}
      </div>

      {allDefs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No integrations available yet.
        </div>
      )}

      {connectDef && (
        <ConnectDialog
          definition={connectDef}
          secrets={secrets ?? []}
          companyId={selectedCompanyId}
          onClose={() => setConnectDef(null)}
        />
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
