import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request } from "express";
import { and, eq, isNull, desc } from "drizzle-orm";
import type { Db } from "@substaff/db";
import {
  agentApiKeys,
  authUsers,
  invites,
  joinRequests,
} from "@substaff/db";
import {
  acceptInviteSchema,
  claimJoinRequestApiKeySchema,
  createCompanyInviteSchema,
  listJoinRequestsQuerySchema,
  updateMemberPermissionsSchema,

  PERMISSION_KEYS,
} from "@substaff/shared";
import type { DeploymentMode } from "@substaff/shared";
import { forbidden, conflict, notFound, unauthorized, badRequest } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { accessService, agentService, logActivity } from "../services/index.js";
import { assertCompanyAccess, companyRouter } from "./authz.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createInviteToken() {
  return `pcp_invite_${randomBytes(24).toString("hex")}`;
}

function createClaimSecret() {
  return `pcp_claim_${randomBytes(24).toString("hex")}`;
}

function tokenHashesMatch(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(new Uint8Array(leftBytes), new Uint8Array(rightBytes));
}

function requestBaseUrl(req: Request) {
  const forwardedProto = req.header("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim() || req.protocol || "http";
  const host = req.header("x-forwarded-host")?.split(",")[0]?.trim() || req.header("host");
  if (!host) return "";
  return `${proto}://${host}`;
}

function readSkillMarkdown(skillName: string): string | null {
  const normalized = skillName.trim().toLowerCase();
  if (normalized !== "substaff" && normalized !== "substaff-create-agent") return null;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../skills", normalized, "SKILL.md"),  // published: dist/routes/ -> <pkg>/skills/
    path.resolve(process.cwd(), "skills", normalized, "SKILL.md"),    // cwd (e.g. monorepo root)
    path.resolve(moduleDir, "../../../skills", normalized, "SKILL.md"), // dev: src/routes/ -> repo root/skills/
  ];
  for (const skillPath of candidates) {
    try {
      return fs.readFileSync(skillPath, "utf8");
    } catch {
      // Continue to next candidate.
    }
  }
  return null;
}

function toJoinRequestResponse(row: typeof joinRequests.$inferSelect) {
  const { claimSecretHash: _claimSecretHash, ...safe } = row;
  return safe;
}

type JoinDiagnostic = {
  code: string;
  level: "info" | "warn";
  message: string;
  hint?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLoopbackHost(hostname: string): boolean {
  const value = hostname.trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function normalizeHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end > 1 ? trimmed.slice(1, end).toLowerCase() : trimmed.toLowerCase();
  }
  const firstColon = trimmed.indexOf(":");
  if (firstColon > -1) return trimmed.slice(0, firstColon).toLowerCase();
  return trimmed.toLowerCase();
}

function buildJoinConnectivityDiagnostics(input: {
  deploymentMode: DeploymentMode;
}): JoinDiagnostic[] {
  const diagnostics: JoinDiagnostic[] = [];

  diagnostics.push({
    code: "deployment_context",
    level: "info",
    message: `Deployment context: mode=${input.deploymentMode}.`,
  });

  return diagnostics;
}

function normalizeAgentDefaultsForJoin(input: {
  adapterType: string | null;
  defaultsPayload: unknown;
  deploymentMode: DeploymentMode;
}) {
  const diagnostics: JoinDiagnostic[] = [];
  const normalized = isPlainObject(input.defaultsPayload)
    ? (input.defaultsPayload as Record<string, unknown>)
    : null;

  diagnostics.push(
    ...buildJoinConnectivityDiagnostics({
      deploymentMode: input.deploymentMode,
    }),
  );

  return { normalized, diagnostics };
}

function toInviteSummaryResponse(req: Request, token: string, invite: typeof invites.$inferSelect) {
  const baseUrl = requestBaseUrl(req);
  const onboardingPath = `/api/invites/${token}/onboarding`;
  const onboardingTextPath = `/api/invites/${token}/onboarding.txt`;
  return {
    id: invite.id,
    companyId: invite.companyId,
    inviteType: invite.inviteType,
    allowedJoinTypes: invite.allowedJoinTypes,
    expiresAt: invite.expiresAt,
    onboardingPath,
    onboardingUrl: baseUrl ? `${baseUrl}${onboardingPath}` : onboardingPath,
    onboardingTextPath,
    onboardingTextUrl: baseUrl ? `${baseUrl}${onboardingTextPath}` : onboardingTextPath,
    skillIndexPath: "/api/skills/index",
    skillIndexUrl: baseUrl ? `${baseUrl}/api/skills/index` : "/api/skills/index",
  };
}

function buildOnboardingDiscoveryDiagnostics(input: {
  apiBaseUrl: string;
  deploymentMode: DeploymentMode;
}): JoinDiagnostic[] {
  const diagnostics: JoinDiagnostic[] = [];
  let apiHost: string | null = null;
  if (input.apiBaseUrl) {
    try {
      apiHost = normalizeHostname(new URL(input.apiBaseUrl).hostname);
    } catch {
      apiHost = null;
    }
  }

  if (apiHost && isLoopbackHost(apiHost)) {
    diagnostics.push({
      code: "onboarding_api_loopback",
      level: "warn",
      message:
        "Onboarding URL resolves to loopback hostname. Remote agents cannot reach localhost on your Substaff host.",
      hint: "Use a reachable hostname/IP (for example Tailscale hostname, Docker host alias, or public domain).",
    });
  }

  return diagnostics;
}

function buildInviteOnboardingManifest(
  req: Request,
  token: string,
  invite: typeof invites.$inferSelect,
  opts: {
    deploymentMode: DeploymentMode;
  },
) {
  const baseUrl = requestBaseUrl(req);
  const skillPath = "/api/skills/substaff";
  const skillUrl = baseUrl ? `${baseUrl}${skillPath}` : skillPath;
  const registrationEndpointPath = `/api/invites/${token}/accept`;
  const registrationEndpointUrl = baseUrl ? `${baseUrl}${registrationEndpointPath}` : registrationEndpointPath;
  const onboardingTextPath = `/api/invites/${token}/onboarding.txt`;
  const onboardingTextUrl = baseUrl ? `${baseUrl}${onboardingTextPath}` : onboardingTextPath;
  const discoveryDiagnostics = buildOnboardingDiscoveryDiagnostics({
    apiBaseUrl: baseUrl,
    deploymentMode: opts.deploymentMode,
  });

  return {
    invite: toInviteSummaryResponse(req, token, invite),
    onboarding: {
      instructions:
        "Join as an agent, save your one-time claim secret, wait for board approval, then claim your API key and install the Substaff skill before starting heartbeat loops.",
      recommendedAdapterType: "e2b_sandbox",
      requiredFields: {
        requestType: "agent",
        agentName: "Display name for this agent",
        adapterType: "Adapter type (e2b_sandbox, process, or http)",
        capabilities: "Optional capability summary",
        agentDefaultsPayload:
          "Optional adapter config",
      },
      registrationEndpoint: {
        method: "POST",
        path: registrationEndpointPath,
        url: registrationEndpointUrl,
      },
      claimEndpointTemplate: {
        method: "POST",
        path: "/api/join-requests/{requestId}/claim-api-key",
        body: {
          claimSecret: "one-time claim secret returned when the join request is created",
        },
      },
      connectivity: {
        deploymentMode: opts.deploymentMode,
        diagnostics: discoveryDiagnostics,
        guidance: "Ensure agents can reach this Substaff API base URL for callbacks and claims.",
      },
      textInstructions: {
        path: onboardingTextPath,
        url: onboardingTextUrl,
        contentType: "text/plain",
      },
      skill: {
        name: "substaff",
        path: skillPath,
        url: skillUrl,
        installPath: "~/.substaff/skills/substaff/SKILL.md",
      },
    },
  };
}

export function buildInviteOnboardingTextDocument(
  req: Request,
  token: string,
  invite: typeof invites.$inferSelect,
  opts: {
    deploymentMode: DeploymentMode;
  },
) {
  const manifest = buildInviteOnboardingManifest(req, token, invite, opts);
  const onboarding = manifest.onboarding as {
    registrationEndpoint: { method: string; path: string; url: string };
    claimEndpointTemplate: { method: string; path: string };
    textInstructions: { path: string; url: string };
    skill: { path: string; url: string; installPath: string };
    connectivity: { diagnostics?: JoinDiagnostic[]; guidance?: string };
  };
  const diagnostics = Array.isArray(onboarding.connectivity?.diagnostics)
    ? onboarding.connectivity.diagnostics
    : [];

  const lines = [
    "# Substaff Agent Onboarding",
    "",
    "This document is meant to be readable by both humans and agents.",
    "",
    "## Invite",
    `- inviteType: ${invite.inviteType}`,
    `- allowedJoinTypes: ${invite.allowedJoinTypes}`,
    `- expiresAt: ${invite.expiresAt.toISOString()}`,
    "",
    "## Step 1: Submit agent join request",
    `${onboarding.registrationEndpoint.method} ${onboarding.registrationEndpoint.url}`,
    "",
    "Body (JSON):",
    "{",
    '  "requestType": "agent",',
    '  "agentName": "My Agent",',
    '  "adapterType": "e2b_sandbox",',
    '  "capabilities": "Optional summary",',
    '  "agentDefaultsPayload": {}',
    "}",
    "",
    "Expected response includes:",
    "- request id",
    "- one-time claimSecret",
    "- claimApiKeyPath",
    "",
    "## Step 2: Wait for board approval",
    "The board approves the join request in Substaff before key claim is allowed.",
    "",
    "## Step 3: Claim API key (one-time)",
    `${onboarding.claimEndpointTemplate.method} /api/join-requests/{requestId}/claim-api-key`,
    "",
    "Body (JSON):",
    "{",
    '  "claimSecret": "<one-time-claim-secret>"',
    "}",
    "",
    "Important:",
    "- claim secrets expire",
    "- claim secrets are single-use",
    "- claim fails before board approval",
    "",
    "## Step 4: Install Substaff skill",
    `GET ${onboarding.skill.url}`,
    `Install path: ${onboarding.skill.installPath}`,
    "",
    "## Text onboarding URL",
    `${onboarding.textInstructions.url}`,
    "",
    "## Connectivity guidance",
    onboarding.connectivity?.guidance ?? "Ensure Substaff is reachable from your agent runtime.",
  ];

  if (diagnostics.length > 0) {
    lines.push("", "## Connectivity diagnostics");
    for (const diag of diagnostics) {
      lines.push(`- [${diag.level}] ${diag.message}`);
      if (diag.hint) lines.push(`  hint: ${diag.hint}`);
    }
  }

  lines.push(
    "",
    "## Helpful endpoints",
    `${onboarding.registrationEndpoint.path}`,
    `${onboarding.claimEndpointTemplate.path}`,
    `${onboarding.skill.path}`,
    manifest.invite.onboardingPath,
  );

  return `${lines.join("\n")}\n`;
}

function requestIp(req: Request) {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip || "unknown";
}

function inviteExpired(invite: typeof invites.$inferSelect) {
  return invite.expiresAt.getTime() <= Date.now();
}

async function resolveActorIdentity(db: Db, req: Request): Promise<{ name: string | null; email: string | null }> {
  const userId = req.actor.userId;
  if (userId) {
    const user = await db
      .select({ name: authUsers.name, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);
    if (user) return { name: user.name ?? null, email: user.email ?? null };
  }
  return { name: null, email: null };
}

function grantsFromDefaults(
  defaultsPayload: Record<string, unknown> | null | undefined,
  key: "human" | "agent",
): Array<{ permissionKey: (typeof PERMISSION_KEYS)[number]; scope: Record<string, unknown> | null }> {
  if (!defaultsPayload || typeof defaultsPayload !== "object") return [];
  const scoped = defaultsPayload[key];
  if (!scoped || typeof scoped !== "object") return [];
  const grants = (scoped as Record<string, unknown>).grants;
  if (!Array.isArray(grants)) return [];
  const validPermissionKeys = new Set<string>(PERMISSION_KEYS);
  const result: Array<{
    permissionKey: (typeof PERMISSION_KEYS)[number];
    scope: Record<string, unknown> | null;
  }> = [];
  for (const item of grants) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.permissionKey !== "string") continue;
    if (!validPermissionKeys.has(record.permissionKey)) continue;
    result.push({
      permissionKey: record.permissionKey as (typeof PERMISSION_KEYS)[number],
      scope:
        record.scope && typeof record.scope === "object" && !Array.isArray(record.scope)
          ? (record.scope as Record<string, unknown>)
          : null,
    });
  }
  return result;
}

export function accessRoutes(
  db: Db,
  opts: {
    deploymentMode: DeploymentMode;
  },
) {
  const router = companyRouter();
  const access = accessService(db);
  const agents = agentService(db);

  async function assertCompanyPermission(req: Request, companyId: string, permissionKey: any) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "agent") {
      if (!req.actor.agentId) throw forbidden();
      const allowed = await access.hasPermission(companyId, "agent", req.actor.agentId, permissionKey);
      if (!allowed) throw forbidden("Permission denied");
      return;
    }
    if (req.actor.type !== "board") throw unauthorized();
    const allowed = await access.canUser(companyId, req.actor.userId, permissionKey);
    if (!allowed) throw forbidden("Permission denied");
  }

  router.get("/skills/index", (_req, res) => {
    res.json({
      skills: [
        { name: "substaff", path: "/api/skills/substaff" },
        { name: "substaff-create-agent", path: "/api/skills/substaff-create-agent" },
      ],
    });
  });

  router.get("/skills/:skillName", (req, res) => {
    const skillName = (req.params.skillName as string).trim().toLowerCase();
    const markdown = readSkillMarkdown(skillName);
    if (!markdown) throw notFound("Skill not found");
    res.type("text/markdown").send(markdown);
  });

  router.post(
    "/companies/:companyId/invites",
    validate(createCompanyInviteSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(req, companyId, "users:invite");

      const token = createInviteToken();
      const created = await db
        .insert(invites)
        .values({
          companyId,
          inviteType: "company_join",
          tokenHash: hashToken(token),
          allowedJoinTypes: req.body.allowedJoinTypes,
          defaultsPayload: req.body.defaultsPayload ?? null,
          expiresAt: new Date(Date.now() + req.body.expiresInHours * 60 * 60 * 1000),
          invitedByUserId: req.actor.userId ?? null,
        })
        .returning()
        .then((rows) => rows[0]);

      await logActivity(db, {
        companyId,
        actorType: req.actor.type === "agent" ? "agent" : "user",
        actorId: req.actor.type === "agent" ? req.actor.agentId ?? "unknown-agent" : req.actor.userId ?? "board",
        action: "invite.created",
        entityType: "invite",
        entityId: created.id,
        details: {
          inviteType: created.inviteType,
          allowedJoinTypes: created.allowedJoinTypes,
          expiresAt: created.expiresAt.toISOString(),
        },
      });

      res.status(201).json({
        ...created,
        token,
        inviteUrl: `/invite/${token}`,
      });
    },
  );

  router.get("/invites/:token", async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || invite.acceptedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }

    res.json(toInviteSummaryResponse(req, token, invite));
  });

  router.get("/invites/:token/onboarding", async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }

    res.json(buildInviteOnboardingManifest(req, token, invite, opts));
  });

  router.get("/invites/:token/onboarding.txt", async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }

    res.type("text/plain; charset=utf-8").send(buildInviteOnboardingTextDocument(req, token, invite, opts));
  });

  router.post("/invites/:token/accept", validate(acceptInviteSchema), async (req, res) => {
    const token = (req.params.token as string).trim();
    if (!token) throw notFound("Invite not found");

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)))
      .then((rows) => rows[0] ?? null);
    if (!invite || invite.revokedAt || invite.acceptedAt || inviteExpired(invite)) {
      throw notFound("Invite not found");
    }

    const requestType = req.body.requestType as "human" | "agent";
    const companyId = invite.companyId;
    if (!companyId) throw conflict("Invite is missing company scope");
    if (invite.allowedJoinTypes !== "both" && invite.allowedJoinTypes !== requestType) {
      throw badRequest(`Invite does not allow ${requestType} joins`);
    }

    if (requestType === "human" && req.actor.type !== "board") {
      throw unauthorized("Human invite acceptance requires authenticated user");
    }
    if (requestType === "human" && !req.actor.userId) {
      throw unauthorized("Authenticated user is required");
    }
    if (requestType === "agent" && !req.body.agentName) {
      throw badRequest("agentName is required for agent join requests");
    }

    const joinDefaults = requestType === "agent"
      ? normalizeAgentDefaultsForJoin({
        adapterType: req.body.adapterType ?? null,
        defaultsPayload: req.body.agentDefaultsPayload ?? null,
        deploymentMode: opts.deploymentMode,
      })
      : { normalized: null as Record<string, unknown> | null, diagnostics: [] as JoinDiagnostic[] };

    const claimSecret = requestType === "agent" ? createClaimSecret() : null;
    const claimSecretHash = claimSecret ? hashToken(claimSecret) : null;
    const claimSecretExpiresAt = claimSecret
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : null;

    const actorIdentity = requestType === "human" ? await resolveActorIdentity(db, req) : null;
    const created = await db.transaction(async (tx) => {
      await tx
        .update(invites)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)));

      const row = await tx
        .insert(joinRequests)
        .values({
          inviteId: invite.id,
          companyId,
          requestType,
          status: "pending_approval",
          requestIp: requestIp(req),
          requestingUserId: requestType === "human" ? req.actor.userId ?? "local-board" : null,
          requestEmailSnapshot: requestType === "human" ? actorIdentity?.email ?? null : null,
          requestNameSnapshot: requestType === "human" ? actorIdentity?.name ?? null : null,
          agentName: requestType === "agent" ? req.body.agentName : null,
          adapterType: requestType === "agent" ? req.body.adapterType ?? null : null,
          capabilities: requestType === "agent" ? req.body.capabilities ?? null : null,
          agentDefaultsPayload: requestType === "agent" ? joinDefaults.normalized : null,
          claimSecretHash,
          claimSecretExpiresAt,
        })
        .returning()
        .then((rows) => rows[0]);
      return row;
    });

    await logActivity(db, {
      companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId:
        req.actor.type === "agent"
          ? req.actor.agentId ?? "invite-agent"
          : req.actor.userId ?? (requestType === "agent" ? "invite-anon" : "board"),
      action: "join.requested",
      entityType: "join_request",
      entityId: created.id,
      details: { requestType, requestIp: created.requestIp },
    });

    const response = toJoinRequestResponse(created);
    if (claimSecret) {
      const onboardingManifest = buildInviteOnboardingManifest(req, token, invite, opts);
      res.status(202).json({
        ...response,
        claimSecret,
        claimApiKeyPath: `/api/join-requests/${created.id}/claim-api-key`,
        onboarding: onboardingManifest.onboarding,
        diagnostics: joinDefaults.diagnostics,
      });
      return;
    }
    res.status(202).json({
      ...response,
      ...(joinDefaults.diagnostics.length > 0 ? { diagnostics: joinDefaults.diagnostics } : {}),
    });
  });

  router.post("/invites/:inviteId/revoke", async (req, res) => {
    const id = req.params.inviteId as string;
    const invite = await db.select().from(invites).where(eq(invites.id, id)).then((rows) => rows[0] ?? null);
    if (!invite) throw notFound("Invite not found");
    if (!invite.companyId) throw conflict("Invite is missing company scope");
    await assertCompanyPermission(req, invite.companyId, "users:invite");
    if (invite.acceptedAt) throw conflict("Invite already consumed");
    if (invite.revokedAt) return res.json(invite);

    const revoked = await db
      .update(invites)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(invites.id, id))
      .returning()
      .then((rows) => rows[0]);

    if (invite.companyId) {
      await logActivity(db, {
        companyId: invite.companyId,
        actorType: req.actor.type === "agent" ? "agent" : "user",
        actorId: req.actor.type === "agent" ? req.actor.agentId ?? "unknown-agent" : req.actor.userId ?? "board",
        action: "invite.revoked",
        entityType: "invite",
        entityId: id,
      });
    }

    res.json(revoked);
  });

  router.get("/companies/:companyId/join-requests", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(req, companyId, "joins:approve");
    const query = listJoinRequestsQuerySchema.parse(req.query);
    const all = await db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.companyId, companyId))
      .orderBy(desc(joinRequests.createdAt));
    const filtered = all.filter((row) => {
      if (query.status && row.status !== query.status) return false;
      if (query.requestType && row.requestType !== query.requestType) return false;
      return true;
    });
    res.json(filtered.map(toJoinRequestResponse));
  });

  router.post("/companies/:companyId/join-requests/:requestId/approve", async (req, res) => {
    const companyId = req.params.companyId as string;
    const requestId = req.params.requestId as string;
    await assertCompanyPermission(req, companyId, "joins:approve");

    const existing = await db
      .select()
      .from(joinRequests)
      .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.id, requestId)))
      .then((rows) => rows[0] ?? null);
    if (!existing) throw notFound("Join request not found");
    if (existing.status !== "pending_approval") throw conflict("Join request is not pending");

    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.id, existing.inviteId))
      .then((rows) => rows[0] ?? null);
    if (!invite) throw notFound("Invite not found");

    let createdAgentId: string | null = existing.createdAgentId ?? null;
    if (existing.requestType === "human") {
      if (!existing.requestingUserId) throw conflict("Join request missing user identity");
      await access.ensureMembership(companyId, "user", existing.requestingUserId, "member", "active");
      const grants = grantsFromDefaults(invite.defaultsPayload as Record<string, unknown> | null, "human");
      await access.setPrincipalGrants(
        companyId,
        "user",
        existing.requestingUserId,
        grants,
        req.actor.userId ?? null,
      );
    } else {
      const created = await agents.create(companyId, {
        name: existing.agentName ?? "New Agent",
        role: "general",
        title: null,
        status: "idle",
        reportsTo: null,
        managerId: req.actor.userId ?? null,
        capabilities: existing.capabilities ?? null,
        adapterType: existing.adapterType ?? "process",
        adapterConfig:
          existing.agentDefaultsPayload && typeof existing.agentDefaultsPayload === "object"
            ? (existing.agentDefaultsPayload as Record<string, unknown>)
            : {},
        runtimeConfig: {},
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
        platformSpentMonthlyCents: 0,
        permissions: {},
        lastHeartbeatAt: null,
        metadata: null,
      });
      createdAgentId = created.id;
      await access.ensureMembership(companyId, "agent", created.id, "member", "active");
      const grants = grantsFromDefaults(invite.defaultsPayload as Record<string, unknown> | null, "agent");
      await access.setPrincipalGrants(companyId, "agent", created.id, grants, req.actor.userId ?? null);
    }

    const approved = await db
      .update(joinRequests)
      .set({
        status: "approved",
        approvedByUserId: req.actor.userId ?? null,
        approvedAt: new Date(),
        createdAgentId,
        updatedAt: new Date(),
      })
      .where(eq(joinRequests.id, requestId))
      .returning()
      .then((rows) => rows[0]);

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "join.approved",
      entityType: "join_request",
      entityId: requestId,
      details: { requestType: existing.requestType, createdAgentId },
    });

    res.json(toJoinRequestResponse(approved));
  });

  router.post("/companies/:companyId/join-requests/:requestId/reject", async (req, res) => {
    const companyId = req.params.companyId as string;
    const requestId = req.params.requestId as string;
    await assertCompanyPermission(req, companyId, "joins:approve");

    const existing = await db
      .select()
      .from(joinRequests)
      .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.id, requestId)))
      .then((rows) => rows[0] ?? null);
    if (!existing) throw notFound("Join request not found");
    if (existing.status !== "pending_approval") throw conflict("Join request is not pending");

    const rejected = await db
      .update(joinRequests)
      .set({
        status: "rejected",
        rejectedByUserId: req.actor.userId ?? null,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(joinRequests.id, requestId))
      .returning()
      .then((rows) => rows[0]);

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "join.rejected",
      entityType: "join_request",
      entityId: requestId,
      details: { requestType: existing.requestType },
    });

    res.json(toJoinRequestResponse(rejected));
  });

  router.post("/join-requests/:requestId/claim-api-key", validate(claimJoinRequestApiKeySchema), async (req, res) => {
    const requestId = req.params.requestId as string;
    const presentedClaimSecretHash = hashToken(req.body.claimSecret);
    const joinRequest = await db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.id, requestId))
      .then((rows) => rows[0] ?? null);
    if (!joinRequest) throw notFound("Join request not found");
    if (joinRequest.requestType !== "agent") throw badRequest("Only agent join requests can claim API keys");
    if (joinRequest.status !== "approved") throw conflict("Join request must be approved before key claim");
    if (!joinRequest.createdAgentId) throw conflict("Join request has no created agent");
    if (!joinRequest.claimSecretHash) throw conflict("Join request is missing claim secret metadata");
    if (!tokenHashesMatch(joinRequest.claimSecretHash, presentedClaimSecretHash)) {
      throw forbidden("Invalid claim secret");
    }
    if (joinRequest.claimSecretExpiresAt && joinRequest.claimSecretExpiresAt.getTime() <= Date.now()) {
      throw conflict("Claim secret expired");
    }
    if (joinRequest.claimSecretConsumedAt) throw conflict("Claim secret already used");

    const existingKey = await db
      .select({ id: agentApiKeys.id })
      .from(agentApiKeys)
      .where(eq(agentApiKeys.agentId, joinRequest.createdAgentId))
      .then((rows) => rows[0] ?? null);
    if (existingKey) throw conflict("API key already claimed");

    const consumed = await db
      .update(joinRequests)
      .set({ claimSecretConsumedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(joinRequests.id, requestId), isNull(joinRequests.claimSecretConsumedAt)))
      .returning({ id: joinRequests.id })
      .then((rows) => rows[0] ?? null);
    if (!consumed) throw conflict("Claim secret already used");

    const created = await agents.createApiKey(joinRequest.createdAgentId, "initial-join-key");

    await logActivity(db, {
      companyId: joinRequest.companyId,
      actorType: "system",
      actorId: "join-claim",
      action: "agent_api_key.claimed",
      entityType: "agent_api_key",
      entityId: created.id,
      details: { agentId: joinRequest.createdAgentId, joinRequestId: requestId },
    });

    res.status(201).json({
      keyId: created.id,
      token: created.token,
      agentId: joinRequest.createdAgentId,
      createdAt: created.createdAt,
    });
  });

  router.get("/companies/:companyId/members", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(req, companyId, "users:manage_permissions");
    const members = await access.listMembers(companyId);
    res.json(members);
  });

  router.patch(
    "/companies/:companyId/members/:memberId/permissions",
    validate(updateMemberPermissionsSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const memberId = req.params.memberId as string;
      await assertCompanyPermission(req, companyId, "users:manage_permissions");
      const updated = await access.setMemberPermissions(
        companyId,
        memberId,
        req.body.grants ?? [],
        req.actor.userId ?? null,
      );
      if (!updated) throw notFound("Member not found");
      res.json(updated);
    },
  );

  return router;
}
