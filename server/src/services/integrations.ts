import { and, eq, desc, inArray } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { integrationConnections, companies } from "@substaff/db";
import { notFound } from "../errors.js";
import { Composio, AuthScheme } from "@composio/core";

function getComposioClient() {
  return new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
  });
}

export function integrationService(db: Db) {
  async function listToolkits() {
    const composio = getComposioClient();

    // Fetch all toolkits and all existing auth configs in parallel
    const [all, authConfigResult] = await Promise.all([
      composio.toolkits.get({ sortBy: "usage" }),
      composio.authConfigs.list({ limit: 200 }),
    ]);

    // Build set of toolkit slugs that have an auth config in our project
    const configuredSlugs = new Set<string>();
    for (const config of authConfigResult?.items ?? []) {
      const slug = (config as any).toolkit?.slug;
      if (slug) configuredSlugs.add(slug.toLowerCase());
    }

    // Composio built-in test/demo toolkits to exclude
    const excludedSlugs = new Set(["test_app"]);

    return (all ?? []).filter(
      (t: any) =>
        !t.isLocalToolkit &&
        !excludedSlugs.has(t.slug) &&
        (t.noAuth || configuredSlugs.has(t.slug.toLowerCase())),
    );
  }

  async function listConnections(companyId: string) {
    const rows = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.companyId, companyId))
      .orderBy(desc(integrationConnections.createdAt));

    if (rows.length === 0) return [];

    // Fetch toolkit metadata for connected providers
    const composio = getComposioClient();
    const toolkitBySlug = new Map<string, any>();
    try {
      const allToolkits = await composio.toolkits.get();
      for (const tk of allToolkits ?? []) {
        toolkitBySlug.set(tk.slug, tk);
      }
    } catch {
      // Continue without enrichment if Composio is unreachable
    }

    return rows.map((conn) => ({
      ...conn,
      toolkit: toolkitBySlug.get(conn.provider) ?? null,
    }));
  }

  async function getConnectionById(id: string) {
    return db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function initiateConnection(
    companyId: string,
    input: { appName: string; integrationId?: string; connectionParams?: Record<string, unknown> },
  ) {
    const [company] = await db
      .select({ vendorId: companies.vendorId })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) throw notFound("Company not found");

    const composio = getComposioClient();

    const baseUrl =
      process.env.SUBSTAFF_API_URL ??
      `http://localhost:${process.env.SUBSTAFF_LISTEN_PORT ?? "3100"}`;
    const callbackUrl = `${baseUrl}/api/integrations/composio/callback?companyId=${encodeURIComponent(companyId)}`;

    // Find an existing auth config for this toolkit, or create a managed one
    let authConfigId: string;
    const existing = await composio.authConfigs.list({ toolkit: input.appName });
    const existingItems = existing?.items ?? [];
    if (existingItems.length > 0) {
      authConfigId = existingItems[0].id;
    } else {
      const created = await composio.authConfigs.create(input.appName.toUpperCase(), {
        name: `substaff-${input.appName}`,
        type: "use_composio_managed_auth",
      });
      authConfigId = created.id;
    }

    // Fetch full auth config details (list response may omit expectedInputFields)
    const authConfig: any = await composio.authConfigs.get(authConfigId);

    // Check if this auth config has required input fields the user must provide
    const expectedFields: any[] = authConfig.expectedInputFields ?? [];
    const requiredFields = expectedFields.filter((f: any) => f.required);

    // If there are required fields and the caller hasn't provided them yet, return the field definitions
    if (requiredFields.length > 0 && !input.connectionParams) {
      return {
        redirectUrl: null,
        connectedAccountId: null,
        connectionStatus: "REQUIRES_INPUT",
        requiredFields: requiredFields.map((f: any) => ({
          name: f.name,
          displayName: f.displayName ?? f.display_name ?? f.name,
          description: f.description ?? "",
          type: f.type ?? "string",
          required: true,
        })),
      };
    }

    // Build typed config using AuthScheme helpers when connection params are provided
    const initiateOptions: any = {
      callbackUrl,
      allowMultiple: true,
    };

    if (input.connectionParams) {
      const scheme = (authConfig.authScheme ?? "OAUTH2") as string;
      const params = input.connectionParams as Record<string, string>;
      switch (scheme) {
        case "OAUTH1":
          initiateOptions.config = AuthScheme.OAuth1(params);
          break;
        case "API_KEY":
          initiateOptions.config = AuthScheme.APIKey(params);
          break;
        case "BASIC":
          initiateOptions.config = AuthScheme.Basic(params as any);
          break;
        case "BEARER_TOKEN":
          initiateOptions.config = AuthScheme.BearerToken(params as any);
          break;
        case "NO_AUTH":
          initiateOptions.config = AuthScheme.NoAuth(params);
          break;
        default:
          initiateOptions.config = AuthScheme.OAuth2(params);
          break;
      }
    }

    const connectionRequest = await composio.connectedAccounts.initiate(
      companyId, // userId = our companyId
      authConfigId,
      initiateOptions,
    );

    return {
      redirectUrl: connectionRequest.redirectUrl,
      connectedAccountId: connectionRequest.id,
      connectionStatus: connectionRequest.status,
    };
  }

  async function completeConnection(
    companyId: string,
    connectedAccountId: string,
  ) {
    const [company] = await db
      .select({ vendorId: companies.vendorId })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) throw notFound("Company not found");

    const composio = getComposioClient();

    // Get the connected account details from Composio
    const account = await composio.connectedAccounts.get(connectedAccountId);
    const toolkitSlug = (account as any).toolkit?.slug
      ?? (account as any).appName
      ?? (account as any).appUniqueId
      ?? "unknown";

    // Remove any existing connection for the same provider
    await db
      .delete(integrationConnections)
      .where(
        and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.provider, toolkitSlug),
        ),
      );

    const [created] = await db
      .insert(integrationConnections)
      .values({
        companyId,
        vendorId: company.vendorId,
        provider: toolkitSlug,
        composioConnectedAccountId: connectedAccountId,
        status: "active",
      })
      .returning();

    return created;
  }

  async function updateConnection(
    id: string,
    patch: {
      config?: Record<string, unknown>;
      status?: string;
    },
  ) {
    const existing = await getConnectionById(id);
    if (!existing) throw notFound("Integration connection not found");

    const [updated] = await db
      .update(integrationConnections)
      .set({
        ...(patch.config !== undefined ? { config: patch.config } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, id))
      .returning();

    return updated ?? null;
  }

  async function disconnectIntegration(id: string) {
    const existing = await getConnectionById(id);
    if (!existing) return null;

    // Revoke on Composio side
    if (existing.composioConnectedAccountId) {
      try {
        const composio = getComposioClient();
        await composio.connectedAccounts.delete(existing.composioConnectedAccountId);
      } catch {
        // Best effort — continue even if Composio deletion fails
      }
    }

    await db.delete(integrationConnections).where(eq(integrationConnections.id, id));
    return existing;
  }

  async function resolveCompanyMcpConfig(companyId: string, providerFilter?: string[] | null) {
    const connections = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.status, "active"),
          ...(providerFilter && providerFilter.length > 0
            ? [inArray(integrationConnections.provider, providerFilter)]
            : []),
        ),
      );

    if (connections.length === 0) return null;

    const activeConnections = connections.filter((c) => c.composioConnectedAccountId);
    if (activeConnections.length === 0) return null;

    const composio = getComposioClient();

    // Create a Composio session scoped to this company (userId = companyId)
    // The session provides a single MCP endpoint (Tool Router) that gives
    // access to all connected toolkits for this user
    const toolkits = providerFilter && providerFilter.length > 0
      ? providerFilter
      : activeConnections.map((c) => c.provider);

    const session = await composio.create(companyId, {
      toolkits,
    });

    const mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }> = {
      composio: {
        type: "http",
        url: session.mcp.url,
        headers: session.mcp.headers as Record<string, string>,
      },
    };

    return { mcpServers };
  }

  return {
    listToolkits,
    listConnections,
    getConnectionById,
    initiateConnection,
    completeConnection,
    updateConnection,
    disconnectIntegration,
    resolveCompanyMcpConfig,
  };
}
