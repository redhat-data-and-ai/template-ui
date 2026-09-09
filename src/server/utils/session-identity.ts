/**
 * Resolve the signed-in identity from the BFF session.
 *
 * Red Hat SSO userinfo often omits `preferred_username` even when the access
 * token carries it. Local Vite also never injects session user into HTML
 * (`data-user`), so callers must derive a stable username/display name here.
 */

export type SessionIdentityUser = {
  email?: string;
  email_verified?: boolean;
  family_name?: string;
  given_name?: string;
  name?: string;
  preferred_username?: string;
  sub?: string;
  displayName?: string;
  [key: string]: unknown;
};

export type SessionLike = {
  user?: SessionIdentityUser;
  token?: {
    access_token?: string;
    id_token?: string;
    /** SSO libraries may store expiry as unix seconds, ISO string, or Date. */
    expires_at?: number | string | Date;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "";
  return email.slice(0, at);
}

/** Decode a JWT payload without verification. Token already came from our SSO session. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function formatExpiresAt(expiresAt: unknown): string | undefined {
  if (expiresAt == null || expiresAt === "") return undefined;
  if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
    return expiresAt.toISOString();
  }
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
    const ms = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
    return new Date(ms).toISOString();
  }
  if (typeof expiresAt === "string") return expiresAt;
  return undefined;
}

export function resolveSessionIdentity(session?: SessionLike | null) {
  const user = { ...(session?.user || {}) };
  const accessToken = asString(session?.token?.access_token);
  const idToken = asString(session?.token?.id_token);
  const claims =
    (accessToken ? decodeJwtPayload(accessToken) : null) ||
    (idToken ? decodeJwtPayload(idToken) : null) ||
    {};

  const email = asString(user.email) || asString(claims.email);
  const name = asString(user.name) || asString(claims.name);
  const givenName = asString(user.given_name) || asString(claims.given_name);
  const familyName = asString(user.family_name) || asString(claims.family_name);
  const sub = asString(user.sub) || asString(claims.sub);
  const preferredUsername =
    asString(user.preferred_username) ||
    asString(claims.preferred_username) ||
    emailLocalPart(email);

  const displayName =
    asString(user.displayName) || name || givenName || preferredUsername || email || "User";

  const resolvedUser: SessionIdentityUser = {
    ...user,
    email: email || undefined,
    name: name || undefined,
    given_name: givenName || undefined,
    family_name: familyName || undefined,
    sub: sub || undefined,
    preferred_username: preferredUsername || undefined,
    displayName,
  };

  return {
    preferred_username: preferredUsername,
    displayName,
    email,
    name,
    sub,
    user: resolvedUser,
    accessToken,
    expiresAt: formatExpiresAt(session?.token?.expires_at),
  };
}

/** Identity forwarded to the agent — username, else JWT sub, else email, else `default`. */
export function resolveXUserIdFromSession(session?: SessionLike | null): string {
  const id = resolveSessionIdentity(session);
  return id.preferred_username || id.sub || id.email || "default";
}

export function toClientUserData(session?: SessionLike | null) {
  const id = resolveSessionIdentity(session);
  return {
    ...id.user,
    accessToken: id.accessToken,
    expiresAt: id.expiresAt,
  };
}

/** Same-origin app path only — never bounce SSO back to an API or auth URL. */
export function safePostLoginRedirect(redirectUri: unknown): string {
  if (typeof redirectUri !== "string") return "/";
  const path = redirectUri.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return "/";
  }
  const pathname = path.split("?")[0] ?? "/";
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/")
  ) {
    return "/";
  }
  return path;
}
