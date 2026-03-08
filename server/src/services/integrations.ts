import { and, eq, desc } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { integrationConnections, mcpServerDefinitions, companies } from "@substaff/db";
import { notFound, unprocessable } from "../errors.js";
import { secretService } from "./secrets.js";

export function integrationService(db: Db) {
  const secrets = secretService(db);

  async function listDefinitions() {
    return db.select().from(mcpServerDefinitions).orderBy(mcpServerDefinitions.displayName);
  }

  async function listConnections(companyId: string) {
    const rows = await db
      .select({
        connection: integrationConnections,
        definition: mcpServerDefinitions,
      })
      .from(integrationConnections)
      .leftJoin(
        mcpServerDefinitions,
        eq(integrationConnections.mcpServerDefinitionId, mcpServerDefinitions.id),
      )
      .where(eq(integrationConnections.companyId, companyId))
      .orderBy(desc(integrationConnections.createdAt));

    return rows.map((r) => ({
      ...r.connection,
      definition: r.definition,
    }));
  }

  async function getConnectionById(id: string) {
    return db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function connectIntegration(
    companyId: string,
    input: {
      definitionId: string;
      credentialSecretIds: Record<string, string>;
      config?: Record<string, unknown>;
    },
  ) {
    // Resolve vendorId from the company record
    const [company] = await db
      .select({ vendorId: companies.vendorId })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) throw notFound("Company not found");

    const [definition] = await db
      .select()
      .from(mcpServerDefinitions)
      .where(eq(mcpServerDefinitions.id, input.definitionId));

    if (!definition) throw notFound("MCP server definition not found");

    // Validate that all required env keys have a secret ref
    for (const key of definition.requiredEnvKeys) {
      if (!input.credentialSecretIds[key]) {
        throw unprocessable(`Missing required credential secret for: ${key}`);
      }
    }

    // Validate that referenced secrets exist and belong to this company
    for (const [key, secretId] of Object.entries(input.credentialSecretIds)) {
      const secret = await secrets.getById(secretId);
      if (!secret) throw notFound(`Secret not found for key: ${key}`);
      if (secret.companyId !== companyId) {
        throw unprocessable(`Secret for ${key} must belong to the same company`);
      }
    }

    // Remove any existing connection for the same provider (allows reconnect)
    await db
      .delete(integrationConnections)
      .where(
        and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.provider, definition.slug),
        ),
      );

    const [created] = await db
      .insert(integrationConnections)
      .values({
        companyId,
        vendorId: company.vendorId,
        provider: definition.slug,
        accessToken: "", // Not used for MCP-based connections
        mcpServerDefinitionId: definition.id,
        credentialSecretIds: input.credentialSecretIds,
        config: input.config ?? null,
        status: "active",
      })
      .returning();

    return { ...created, definition };
  }

  async function updateConnection(
    id: string,
    patch: {
      credentialSecretIds?: Record<string, string>;
      config?: Record<string, unknown>;
      status?: string;
    },
  ) {
    const existing = await getConnectionById(id);
    if (!existing) throw notFound("Integration connection not found");

    const [updated] = await db
      .update(integrationConnections)
      .set({
        ...(patch.credentialSecretIds !== undefined
          ? { credentialSecretIds: patch.credentialSecretIds }
          : {}),
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
    await db.delete(integrationConnections).where(eq(integrationConnections.id, id));
    return existing;
  }

  async function resolveCompanyMcpConfig(companyId: string) {
    const connections = await db
      .select({
        connection: integrationConnections,
        definition: mcpServerDefinitions,
      })
      .from(integrationConnections)
      .innerJoin(
        mcpServerDefinitions,
        eq(integrationConnections.mcpServerDefinitionId, mcpServerDefinitions.id),
      )
      .where(
        and(
          eq(integrationConnections.companyId, companyId),
          eq(integrationConnections.status, "active"),
        ),
      );

    if (connections.length === 0) return null;

    const mcpServers: Record<
      string,
      { command: string; args: string[]; env: Record<string, string> }
    > = {};

    for (const { connection, definition } of connections) {
      try {
        const env: Record<string, string> = {};
        const credSecrets = (connection.credentialSecretIds ?? {}) as Record<string, string>;

        for (const [envKey, secretId] of Object.entries(credSecrets)) {
          env[envKey] = await secrets.resolveSecretValue(companyId, secretId, "latest");
        }

        mcpServers[definition.slug] = {
          command: definition.mcpCommand,
          args: [...definition.mcpArgs],
          env,
        };
      } catch {
        // Skip invalid connections rather than failing the entire run
        continue;
      }
    }

    if (Object.keys(mcpServers).length === 0) return null;

    return { mcpServers };
  }

  return {
    listDefinitions,
    listConnections,
    getConnectionById,
    connectIntegration,
    updateConnection,
    disconnectIntegration,
    resolveCompanyMcpConfig,
  };
}
