/**
 * User bearer token authentication for mobile/API clients.
 *
 * Uses HS256 JWTs (same approach as agent JWTs) to issue tokens for
 * authenticated users. These tokens are an alternative to session cookies
 * for non-browser clients like the React Native app.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface UserTokenClaims {
  sub: string; // User ID
  email: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  type: "user_token";
}

const JWT_ALGORITHM = "HS256";

function getSecret(): string | null {
  return (
    process.env.BETTER_AUTH_SECRET ??
    process.env.SUBSTAFF_AGENT_JWT_SECRET ??
    null
  );
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(secret: string, signingInput: string) {
  return createHmac("sha256", secret).update(signingInput).digest("base64url");
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
}

/**
 * Create a bearer token JWT for a user.
 * Returns null if no signing secret is configured.
 */
export function createUserToken(
  userId: string,
  email: string,
): string | null {
  const secret = getSecret();
  if (!secret) return null;

  const ttlSeconds = parseNumber(
    process.env.SUBSTAFF_USER_TOKEN_TTL_SECONDS,
    60 * 60 * 24 * 30, // 30 days default
  );

  const now = Math.floor(Date.now() / 1000);
  const claims: UserTokenClaims = {
    sub: userId,
    email,
    iat: now,
    exp: now + ttlSeconds,
    iss: "substaff",
    aud: "substaff-api",
    type: "user_token",
  };

  const header = { alg: JWT_ALGORITHM, typ: "JWT" };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const signature = signPayload(secret, signingInput);

  return `${signingInput}.${signature}`;
}

/**
 * Verify a user bearer token JWT.
 * Returns the claims if valid, null otherwise.
 */
export function verifyUserToken(token: string): UserTokenClaims | null {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, claimsB64, signature] = parts;

  const header = parseJson(base64UrlDecode(headerB64));
  if (!header || header.alg !== JWT_ALGORITHM) return null;

  const signingInput = `${headerB64}.${claimsB64}`;
  const expectedSig = signPayload(secret, signingInput);
  if (!safeCompare(signature, expectedSig)) return null;

  const claims = parseJson(base64UrlDecode(claimsB64));
  if (!claims) return null;

  if (claims.type !== "user_token") return null;

  const sub = typeof claims.sub === "string" ? claims.sub : null;
  const email = typeof claims.email === "string" ? claims.email : null;
  const iat = typeof claims.iat === "number" ? claims.iat : null;
  const exp = typeof claims.exp === "number" ? claims.exp : null;
  if (!sub || !email || !iat || !exp) return null;

  const now = Math.floor(Date.now() / 1000);
  if (exp < now) return null;

  return {
    sub,
    email,
    iat,
    exp,
    iss: typeof claims.iss === "string" ? claims.iss : "substaff",
    aud: typeof claims.aud === "string" ? claims.aud : "substaff-api",
    type: "user_token",
  };
}
