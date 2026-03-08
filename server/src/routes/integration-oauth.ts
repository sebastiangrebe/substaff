import { Router } from "express";
import crypto from "node:crypto";
import type { Db } from "@substaff/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import { integrationService } from "../services/integrations.js";
import { secretService } from "../services/secrets.js";
import { mcpServerDefinitions, companies } from "@substaff/db";
import { eq } from "drizzle-orm";

/**
 * OAuth configuration for integrations that require browser-based authorization.
 * Currently supports Google Drive; extensible to Slack, etc.
 *
 * The flow:
 *  1. UI opens GET /api/integrations/oauth/{slug}/authorize?companyId=X
 *  2. Server redirects browser to provider's OAuth consent screen
 *  3. Provider redirects back to GET /api/integrations/oauth/{slug}/callback?code=...&state=...
 *  4. Server exchanges code for tokens, stores as secrets, creates integration connection
 *  5. Server redirects browser back to UI integrations page with ?oauth=success
 */

// -- Google Drive OAuth helpers --

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Redirect URI must match what's configured in Google Cloud Console
  const baseUrl = process.env.SUBSTAFF_API_URL ?? `http://localhost:${process.env.SUBSTAFF_LISTEN_PORT ?? "3100"}`;
  const redirectUri = `${baseUrl}/api/integrations/oauth/google-drive/callback`;

  return { clientId, clientSecret, redirectUri };
}

// Simple HMAC-based state signing to prevent CSRF
function getStateSecret(): string {
  return process.env.BETTER_AUTH_SECRET
    ?? process.env.SUBSTAFF_AGENT_JWT_SECRET
    ?? "substaff-oauth-state-default";
}

function signState(payload: Record<string, string>): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString("base64url");
  const sig = crypto.createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyState(state: string): Record<string, string> | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

export function integrationOAuthRoutes(db: Db) {
  const router = Router();
  const svc = integrationService(db);
  const secrets = secretService(db);

  // ---- Google Drive OAuth ----

  // Step 1: Initiate — redirect user to Google consent screen
  router.get("/integrations/oauth/google-drive/authorize", async (req, res) => {
    assertBoard(req);
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ error: "companyId query parameter required" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const config = getGoogleOAuthConfig();
    if (!config) {
      res.status(500).json({
        error: "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET env vars.",
      });
      return;
    }

    // Fetch company prefix for the post-OAuth redirect back to the UI
    const [company] = await db
      .select({ issuePrefix: companies.issuePrefix })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const state = signState({
      companyId,
      companyPrefix: company?.issuePrefix ?? "",
      userId: req.actor.userId ?? "",
      nonce: crypto.randomBytes(16).toString("hex"),
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: GOOGLE_DRIVE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // Step 2: Callback — exchange code for tokens, store, create connection
  router.get("/integrations/oauth/google-drive/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const stateParam = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    // Determine UI redirect base (for success/error redirects back to the app)
    const uiBase = process.env.SUBSTAFF_UI_URL ?? "";

    // Helper to build company-prefixed integrations URL
    const integrationsUrl = (prefix: string | undefined, params: string) => {
      const base = prefix ? `${uiBase}/${prefix}/integrations` : `${uiBase}/integrations`;
      return `${base}?${params}`;
    };

    // Before we have state, we can't know the prefix — use a generic fallback
    if (error) {
      res.redirect(`${uiBase}/integrations?oauth=error&message=${encodeURIComponent(error)}`);
      return;
    }

    if (!code || !stateParam) {
      res.redirect(`${uiBase}/integrations?oauth=error&message=${encodeURIComponent("Missing code or state")}`);
      return;
    }

    const stateData = verifyState(stateParam);
    if (!stateData || !stateData.companyId) {
      res.redirect(`${uiBase}/integrations?oauth=error&message=${encodeURIComponent("Invalid state")}`);
      return;
    }

    const { companyId, companyPrefix, userId } = stateData;

    const config = getGoogleOAuthConfig();
    if (!config) {
      res.redirect(integrationsUrl(companyPrefix, `oauth=error&message=${encodeURIComponent("OAuth not configured")}`));
      return;
    }

    try {
      // Exchange authorization code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        res.redirect(integrationsUrl(companyPrefix, `oauth=error&message=${encodeURIComponent(`Token exchange failed: ${errBody}`)}`));
        return;
      }

      const tokens = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        token_type: string;
        scope: string;
      };

      if (!tokens.refresh_token) {
        res.redirect(integrationsUrl(companyPrefix, `oauth=error&message=${encodeURIComponent("No refresh token received. Try revoking app access in Google Account and reconnecting.")}`));
        return;
      }

      // Build credentials for @a-bonus/google-docs-mcp:
      // 1. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as env vars
      // 2. Token file at ~/.config/google-docs-mcp/token.json with authorized_user format
      const tokenJson = JSON.stringify({
        type: "authorized_user",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokens.refresh_token,
      });

      const actor = { userId: userId || null, agentId: null };

      // Store client ID, client secret, and token as company secrets
      const clientIdSecretId = await upsertSecret(
        db, secrets, companyId,
        "google-drive/GOOGLE_CLIENT_ID",
        config.clientId,
        "Google OAuth Client ID",
        actor,
      );

      const clientSecretSecretId = await upsertSecret(
        db, secrets, companyId,
        "google-drive/GOOGLE_CLIENT_SECRET",
        config.clientSecret,
        "Google OAuth Client Secret",
        actor,
      );

      const tokenSecretId = await upsertSecret(
        db, secrets, companyId,
        "google-drive/GOOGLE_DOCS_MCP_TOKEN",
        tokenJson,
        "Google Docs MCP OAuth token (auto-generated via OAuth flow)",
        actor,
      );

      // Find the google-drive definition
      const [definition] = await db
        .select()
        .from(mcpServerDefinitions)
        .where(eq(mcpServerDefinitions.slug, "google-drive"));

      if (!definition) {
        res.redirect(integrationsUrl(companyPrefix, `oauth=error&message=${encodeURIComponent("Google Drive integration definition not found in database")}`));
        return;
      }

      // Create the integration connection
      await svc.connectIntegration(companyId, {
        definitionId: definition.id,
        credentialSecretIds: {
          GOOGLE_CLIENT_ID: clientIdSecretId,
          GOOGLE_CLIENT_SECRET: clientSecretSecretId,
          GOOGLE_DOCS_MCP_TOKEN: tokenSecretId,
        },
      });

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: userId || "board",
        action: "integration.connected",
        entityType: "integration",
        entityId: definition.id,
        details: { provider: "google-drive", method: "oauth" },
      });

      res.redirect(integrationsUrl(companyPrefix, "oauth=success&provider=google-drive"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.redirect(integrationsUrl(companyPrefix, `oauth=error&message=${encodeURIComponent(message)}`));
    }
  });

  // Check if OAuth is available for a given slug
  router.get("/integrations/oauth/:slug/available", (req, res) => {
    const slug = req.params.slug;
    if (slug === "google-drive") {
      const config = getGoogleOAuthConfig();
      res.json({ available: !!config });
      return;
    }
    res.json({ available: false });
  });

  return router;
}

// Helper: create a secret or rotate if it already exists
async function upsertSecret(
  db: Db,
  secrets: ReturnType<typeof secretService>,
  companyId: string,
  name: string,
  value: string,
  description: string,
  actor: { userId: string | null; agentId: string | null },
): Promise<string> {
  const existing = await secrets.getByName(companyId, name);
  if (existing) {
    await secrets.rotate(existing.id, { value }, actor);
    return existing.id;
  }
  const created = await secrets.create(
    companyId,
    { name, provider: "local_encrypted", value, description },
    actor,
  );
  return created.id;
}
