/** Base64url-decode a JWT payload segment. Returns {} on any error. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const segment = token.split(".")[1];
    if (!segment) return {};
    const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64url").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Parse a comma-separated group list env var into lowercase entries.
 * Returns an empty array when the var is unset, empty, or whitespace-only.
 */
function parseGroups(envVar: string | undefined): string[] {
  if (!envVar) return [];
  return envVar
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve the user's ROVER role from a decoded JWT payload.
 *
 * Reads DEVELOPER_GROUP and USER_GROUP env vars (comma-separated lists).
 * Both empty → 'developer' (open).
 * Only DEVELOPER_GROUP set → members are developer; others denied.
 * Only USER_GROUP set → members are viewer (no eval / developer page); others denied.
 * Both set: DEVELOPER_GROUP → developer, USER_GROUP → viewer, neither → denied.
 * Called from OIDC login and from the gateway-token path (AUTH_ENABLED=false).
 */
export function resolveRole(
  payload: Record<string, unknown>,
): "developer" | "viewer" | "denied" {
  const devGroups = parseGroups(process.env.DEVELOPER_GROUP);
  const userGroups = parseGroups(process.env.USER_GROUP);

  if (devGroups.length === 0 && userGroups.length === 0) return "developer";

  const realmAccess = payload["realm_access"] as Record<string, unknown> | undefined;
  const roles = ((realmAccess?.["roles"] as string[] | undefined) ?? []).map(r => r.toLowerCase());

  if (devGroups.length > 0 && roles.some((r) => devGroups.includes(r))) return "developer";
  if (userGroups.length > 0 && roles.some((r) => userGroups.includes(r))) return "viewer";
  return "denied";
}
