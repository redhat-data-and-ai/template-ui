import { loadPromptMdConfig } from "./prompt-md.js";
import {
  resolveUserRole,
  PRIVILEGED_ROLES,
  type LdapRole,
} from "./ldap-client.js";

export type UserRole =
  | "owners"
  | "admins"
  | "builders"
  | "users"
  | "denied"
  | null;

let startupWarningLogged = false;

/**
 * Resolve a user's role from PROMPT.md groups + LDAP membership.
 * Returns null only when AUTH_ENABLED=false (local dev — full access).
 * No groups in PROMPT.md → 'users' (chat only, no developer/eval/dataset).
 * When accessibility is 'public' and user is not in any group, returns 'users' (chat-only access).
 * When accessibility is 'private' and user is not in any group, returns 'denied' (no access).
 */
export async function resolveRole(userId: string): Promise<UserRole> {
  const config = loadPromptMdConfig();
  if (!config.groups) return "users";

  const isPublic = config.accessibility === "public";

  if (!process.env.LDAP_URL) {
    if (!startupWarningLogged) {
      console.warn(
        "[RoleResolver] PROMPT.md has groups defined but LDAP_URL is not set — denying all access (fail-closed)",
      );
      startupWarningLogged = true;
    }
    return isPublic ? "users" : "denied";
  }

  const role = (await resolveUserRole(userId, config.groups)) as UserRole;
  if (role === "denied" && isPublic) return "users";
  return role;
}

/** Returns true if the role has access to developer/eval features. null = AUTH_ENABLED=false (dev mode, full access). */
export function isPrivilegedRole(role: UserRole): boolean {
  if (role === null) return true;
  return PRIVILEGED_ROLES.has(role);
}
