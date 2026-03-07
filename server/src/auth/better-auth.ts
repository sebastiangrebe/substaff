import type { Request, RequestHandler } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { toNodeHandler } from "better-auth/node";
import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  vendors,
  vendorMemberships,
} from "@substaff/db";
import type { Config } from "../config.js";

export type BetterAuthSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type BetterAuthSessionResult = {
  session: { id: string; userId: string } | null;
  user: BetterAuthSessionUser | null;
};

type BetterAuthInstance = ReturnType<typeof betterAuth>;

function headersFromNodeHeaders(rawHeaders: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, raw] of Object.entries(rawHeaders)) {
    if (!raw) continue;
    if (Array.isArray(raw)) {
      for (const value of raw) headers.append(key, value);
      continue;
    }
    headers.set(key, raw);
  }
  return headers;
}

function headersFromExpressRequest(req: Request): Headers {
  return headersFromNodeHeaders(req.headers);
}

function generateVendorSlug(email: string): string {
  return email
    .split("@")
    .join("-")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

async function ensureUniqueSlug(db: Db, baseSlug: string): Promise<string> {
  let slug = baseSlug;
  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.slug, slug))
      .then((rows) => rows[0] ?? null);
    if (!existing) return slug;
    slug = `${baseSlug}-${randomBytes(3).toString("hex")}`;
  }
  return `${baseSlug}-${randomBytes(6).toString("hex")}`;
}

export function createBetterAuthInstance(db: Db, config: Config): BetterAuthInstance {
  const baseUrl = config.authPublicBaseUrl;
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.SUBSTAFF_AGENT_JWT_SECRET ?? "substaff-dev-secret";

  const authConfig = {
    baseURL: baseUrl,
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string; email?: string | null; name?: string | null }) => {
            const email = user.email ?? "user@unknown.local";
            const name = user.name ?? email.split("@")[0] ?? "My Workspace";
            const baseSlug = generateVendorSlug(email);
            const slug = await ensureUniqueSlug(db, baseSlug);

            const [vendor] = await db
              .insert(vendors)
              .values({
                name,
                slug,
                billingEmail: email,
              })
              .returning();

            await db.insert(vendorMemberships).values({
              vendorId: vendor.id,
              userId: user.id,
              role: "owner",
            });
          },
        },
      },
    },
  };

  if (!baseUrl) {
    delete (authConfig as { baseURL?: string }).baseURL;
  }

  return betterAuth(authConfig);
}

export function createBetterAuthHandler(auth: BetterAuthInstance): RequestHandler {
  const handler = toNodeHandler(auth);
  return (req, res, next) => {
    void Promise.resolve(handler(req, res)).catch(next);
  };
}

export async function resolveBetterAuthSessionFromHeaders(
  auth: BetterAuthInstance,
  headers: Headers,
): Promise<BetterAuthSessionResult | null> {
  const api = (auth as unknown as { api?: { getSession?: (input: unknown) => Promise<unknown> } }).api;
  if (!api?.getSession) return null;

  const sessionValue = await api.getSession({
    headers,
  });
  if (!sessionValue || typeof sessionValue !== "object") return null;

  const value = sessionValue as {
    session?: { id?: string; userId?: string } | null;
    user?: { id?: string; email?: string | null; name?: string | null } | null;
  };
  const session = value.session?.id && value.session.userId
    ? { id: value.session.id, userId: value.session.userId }
    : null;
  const user = value.user?.id
    ? {
        id: value.user.id,
        email: value.user.email ?? null,
        name: value.user.name ?? null,
      }
    : null;

  if (!session || !user) return null;
  return { session, user };
}

export async function resolveBetterAuthSession(
  auth: BetterAuthInstance,
  req: Request,
): Promise<BetterAuthSessionResult | null> {
  return resolveBetterAuthSessionFromHeaders(auth, headersFromExpressRequest(req));
}
