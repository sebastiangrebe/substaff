import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { agentApiKeys, agents, companyMemberships, vendorMemberships, companies } from "@substaff/db";
import { verifyLocalAgentJwt } from "../agent-auth-jwt.js";
import type { BetterAuthSessionResult } from "../auth/better-auth.js";
import { logger } from "./logger.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

interface ActorMiddlewareOptions {
  resolveSession?: (req: Request) => Promise<BetterAuthSessionResult | null>;
}

export function actorMiddleware(db: Db, opts: ActorMiddlewareOptions): RequestHandler {
  return async (req, _res, next) => {
    req.actor = { type: "none", source: "none" };

    const runIdHeader = req.header("x-substaff-run-id");

    const authHeader = req.header("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      if (opts.resolveSession) {
        let session: BetterAuthSessionResult | null = null;
        try {
          session = await opts.resolveSession(req);
        } catch (err) {
          logger.warn(
            { err, method: req.method, url: req.originalUrl },
            "Failed to resolve auth session from request headers",
          );
        }
        if (session?.user?.id) {
          const userId = session.user.id;
          const [vendorMembershipRows, membershipRows] = await Promise.all([
            db
              .select({
                vendorId: vendorMemberships.vendorId,
                role: vendorMemberships.role,
              })
              .from(vendorMemberships)
              .where(eq(vendorMemberships.userId, userId)),
            db
              .select({ companyId: companyMemberships.companyId })
              .from(companyMemberships)
              .where(
                and(
                  eq(companyMemberships.principalType, "user"),
                  eq(companyMemberships.principalId, userId),
                  eq(companyMemberships.status, "active"),
                ),
              ),
          ]);

          const vendorIds = vendorMembershipRows.map((row) => row.vendorId);
          const isVendorOwner = vendorMembershipRows.some((row) => row.role === "owner");

          // For vendor owners, include ALL companies under their vendors
          // so RLS policies grant access to all vendor resources
          let companyIds = membershipRows.map((row) => row.companyId);
          if (isVendorOwner && vendorIds.length > 0) {
            const vendorCompanies = await db
              .select({ id: companies.id })
              .from(companies)
              .where(inArray(companies.vendorId, vendorIds));
            const allCompanyIds = new Set([
              ...companyIds,
              ...vendorCompanies.map((c) => c.id),
            ]);
            companyIds = [...allCompanyIds];
          }

          req.actor = {
            type: "board",
            userId,
            vendorIds,
            companyIds,
            isVendorOwner,
            runId: runIdHeader ?? undefined,
            source: "session",
          };
          next();
          return;
        }
      }
      if (runIdHeader) req.actor.runId = runIdHeader;
      next();
      return;
    }

    const token = authHeader.slice("bearer ".length).trim();
    if (!token) {
      next();
      return;
    }

    const tokenHash = hashToken(token);
    const key = await db
      .select()
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.keyHash, tokenHash), isNull(agentApiKeys.revokedAt)))
      .then((rows) => rows[0] ?? null);

    if (!key) {
      const claims = verifyLocalAgentJwt(token);
      if (!claims) {
        next();
        return;
      }

      const agentRecord = await db
        .select()
        .from(agents)
        .where(eq(agents.id, claims.sub))
        .then((rows) => rows[0] ?? null);

      if (!agentRecord || agentRecord.companyId !== claims.company_id) {
        next();
        return;
      }

      if (agentRecord.status === "terminated" || agentRecord.status === "pending_approval") {
        next();
        return;
      }

      // Use vendor_id from JWT claims if available, otherwise resolve from company
      let vendorId = claims.vendor_id;
      if (!vendorId) {
        const company = await db
          .select({ vendorId: companies.vendorId })
          .from(companies)
          .where(eq(companies.id, claims.company_id))
          .then((rows) => rows[0] ?? null);
        vendorId = company?.vendorId;
      }

      req.actor = {
        type: "agent",
        agentId: claims.sub,
        companyId: claims.company_id,
        vendorId,
        keyId: undefined,
        runId: runIdHeader || claims.run_id || undefined,
        source: "agent_jwt",
      };
      next();
      return;
    }

    await db
      .update(agentApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentApiKeys.id, key.id));

    const agentRecord = await db
      .select()
      .from(agents)
      .where(eq(agents.id, key.agentId))
      .then((rows) => rows[0] ?? null);

    if (!agentRecord || agentRecord.status === "terminated" || agentRecord.status === "pending_approval") {
      next();
      return;
    }

    // Resolve vendorId from company
    const company = await db
      .select({ vendorId: companies.vendorId })
      .from(companies)
      .where(eq(companies.id, key.companyId))
      .then((rows) => rows[0] ?? null);

    req.actor = {
      type: "agent",
      agentId: key.agentId,
      companyId: key.companyId,
      vendorId: company?.vendorId,
      keyId: key.id,
      runId: runIdHeader || undefined,
      source: "agent_key",
    };

    next();
  };
}

export function requireBoard(req: Express.Request) {
  return req.actor.type === "board";
}
