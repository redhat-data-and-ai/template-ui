import fs from "node:fs";
import { Client } from "ldapts";
import { getRedisClient } from "./redis.js";
import type { GroupRoleMapping } from "./prompt-md.js";

export const ROLE_HIERARCHY: Record<string, number> = {
  owners: 4,
  admins: 3,
  builders: 2,
  users: 1,
};

export const PRIVILEGED_ROLES = new Set(["owners", "admins", "builders"]);

export type LdapRole = "owners" | "admins" | "builders" | "users" | "denied";

const COOLDOWN_TRANSIENT_MS = 3_000;
const COOLDOWN_INVALID_CREDENTIALS_MS = 30_000;
const COOLDOWN_ACCOUNT_LOCKED_MS = 60_000;

const memoryCache = new Map<string, { result: boolean; ts: number }>();

let ldapClient: Client | null = null;
let bindFailed = false;
let bindFailedAt = 0;
let bindPromise: Promise<Client | null> | null = null;

function getCacheTtl(): number {
  return parseInt(process.env.LDAP_CACHE_TTL_SECONDS || "300", 10) * 1000;
}

function escapeLdapFilter(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\\*()\x00]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

function deriveBaseDn(ldapUrl: string): string {
  try {
    const hostname = new URL(ldapUrl).hostname;
    return hostname
      .split(".")
      .slice(-2)
      .map((part) => `dc=${part}`)
      .join(",");
  } catch {
    return "";
  }
}

function getGroupSearchBase(): string {
  const ldapUrl = process.env.LDAP_URL || "";
  const baseDn = deriveBaseDn(ldapUrl);
  return (
    process.env.LDAP_GROUP_SEARCH_BASE ||
    `ou=adhoc,ou=managedGroups,${baseDn}`
  );
}

function getBindDn(): string {
  if (process.env.LDAP_BIND_DN) return process.env.LDAP_BIND_DN;
  const ldapUrl = process.env.LDAP_URL || "";
  const baseDn = deriveBaseDn(ldapUrl);
  const uid = process.env.LDAP_BASE_UID || "";
  return `uid=${uid},ou=users,${baseDn}`;
}

function getUserBase(): string {
  if (process.env.LDAP_USER_BASE) return process.env.LDAP_USER_BASE;
  return deriveBaseDn(process.env.LDAP_URL || "");
}

function getMemberAttrs(): string[] {
  const envVal = process.env.LDAP_MEMBER_ATTRS;
  if (envVal) return envVal.split(",").map((a) => a.trim());
  return ["member", "uniqueMember", "memberUid"];
}

async function doBind(): Promise<Client | null> {
  const ldapUrl = process.env.LDAP_URL;
  if (!ldapUrl) return null;
  if (!ldapUrl.startsWith("ldaps://")) {
    console.error("[LDAP] LDAP_URL must use ldaps:// — refusing to send credentials in cleartext");
    return null;
  }

  const password = process.env.LDAP_PASSWORD || "";
  const bindDn = getBindDn();
  const connectTimeout =
    parseInt(process.env.LDAP_CONNECT_TIMEOUT || "10", 10) * 1000;
  const tlsOptions: Record<string, unknown> = {};
  if (process.env.LDAP_CA_CERT) {
    try {
      tlsOptions.ca = fs.readFileSync(process.env.LDAP_CA_CERT);
    } catch (err) {
      console.error("[LDAP] Failed to read LDAP_CA_CERT: %s — aborting bind", (err as Error).message);
      return null;
    }
  }

  console.info("[LDAP] Attempting bind — url=%s group_search_base=%s", ldapUrl, getGroupSearchBase());

  for (let attempt = 0; attempt < 2; attempt++) {
    const client = new Client({ url: ldapUrl, connectTimeout, tlsOptions, autoRebind: true });
    try {
      await client.bind(bindDn, password);
      ldapClient = client;
      bindFailed = false;
      console.info("[LDAP] Bound successfully to %s", ldapUrl);
      return ldapClient;
    } catch (err) {
      try { await client.unbind(); } catch { /* ignore — connection may already be closed */ }

      const code = (err as { status?: number }).status;
      let cooldown: number;
      let reason: string;

      if (code === 49) {
        cooldown = COOLDOWN_INVALID_CREDENTIALS_MS;
        reason = "invalid credentials";
      } else if (code === 53) {
        cooldown = COOLDOWN_ACCOUNT_LOCKED_MS;
        reason = "account locked";
      } else {
        cooldown = COOLDOWN_TRANSIENT_MS;
        reason = "connection error";
      }

      const isAuthError = cooldown > COOLDOWN_TRANSIENT_MS;
      const isLastAttempt = attempt === 1 || isAuthError;

      if (isLastAttempt) {
        console.error("[LDAP] Bind failed: %s (retry in %ds)", reason, cooldown / 1000);
        bindFailed = true;
        bindFailedAt = Date.now() + cooldown;
        ldapClient = null;
        return null;
      }

      console.warn("[LDAP] Bind transient error on attempt 1 — retrying immediately");
    }
  }
  return null;
}

async function ensureBound(): Promise<Client | null> {
  if (!process.env.LDAP_URL) return null;

  if (bindFailed && Date.now() < bindFailedAt) return null;

  if (bindPromise) return bindPromise;

  if (ldapClient && !bindFailed) {
    if (ldapClient.isConnected) return ldapClient;
    ldapClient = null;
  }

  bindPromise = doBind();
  try {
    return await bindPromise;
  } finally {
    bindPromise = null;
  }
}

async function cacheGet(key: string): Promise<boolean | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const val = await redis.get(key);
      if (val !== null) return val === "1";
    } catch {
      /* Redis down — fall through */
    }
  }

  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.ts < getCacheTtl()) {
    return entry.result;
  }
  return null;
}

async function cacheSet(key: string, value: boolean): Promise<void> {
  const ttlSeconds = parseInt(
    process.env.LDAP_CACHE_TTL_SECONDS || "300",
    10,
  );
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.setex(key, ttlSeconds, value ? "1" : "0");
    } catch {
      /* Redis down — fall through to memory */
    }
  }
  memoryCache.set(key, { result: value, ts: Date.now() });
}

/** Check if a user belongs to an LDAP group. Results are cached in Redis (with in-memory fallback) for LDAP_CACHE_TTL_SECONDS. */
export async function isUserInGroup(
  userId: string,
  groupCn: string,
): Promise<boolean> {
  const cacheKey = `ldap:membership:${userId}:${groupCn}`;

  const cached = await cacheGet(cacheKey);
  if (cached !== null) return cached;

  const searchBase = getGroupSearchBase();
  const memberAttrs = getMemberAttrs();
  const userAttr = process.env.LDAP_USER_ATTR || "uid";
  const userBase = getUserBase();

  for (let attempt = 0; attempt < 2; attempt++) {
    const client = await ensureBound();
    if (!client) return false;

    try {
      const { searchEntries } = await client.search(searchBase, {
        scope: "sub",
        filter: `(cn=${escapeLdapFilter(groupCn)})`,
        attributes: memberAttrs,
      });

      let found = false;
      for (const entry of searchEntries) {
        for (const attr of memberAttrs) {
          const values = entry[attr];
          if (!values) continue;
          const memberList = Array.isArray(values) ? values : [values];
          for (const member of memberList) {
            const memberStr =
              typeof member === "string"
                ? member
                : member instanceof Buffer
                  ? member.toString("utf-8")
                  : String(member);
            const memberLower = memberStr.toLowerCase();
            if (
              memberLower === userId.toLowerCase() ||
              (userBase && memberLower === `${userAttr}=${userId},${userBase}`.toLowerCase())
            ) {
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }

      await cacheSet(cacheKey, found);
      return found;
    } catch (err) {
      console.error(
        `[LDAP] Search failed for group ${groupCn}:`,
        (err as Error).message,
      );
      if (ldapClient === client) {
        try { await client.unbind(); } catch { /* ignore */ }
        ldapClient = null;
        bindFailed = true;
      }
      if (attempt === 0) {
        console.warn("[LDAP] Retrying with fresh connection");
        continue;
      }
      return false;
    }
  }
  return false;
}

/** Resolve a user's highest-priority role by checking LDAP group membership against the provided mappings. Returns 'denied' if no groups match. */
export async function resolveUserRole(
  userId: string,
  groupMappings: GroupRoleMapping[],
): Promise<LdapRole> {
  if (!process.env.LDAP_URL) return "denied";

  let highestRole: string | null = null;
  let highestPriority = 0;

  for (const mapping of groupMappings) {
    const isMember = await isUserInGroup(userId, mapping.group);
    if (isMember) {
      const priority = ROLE_HIERARCHY[mapping.role] || 0;
      if (priority > highestPriority) {
        highestPriority = priority;
        highestRole = mapping.role;
      }
    }
  }

  return (highestRole as LdapRole) || "denied";
}

/** Unbind the LDAP client and clear the in-memory cache. Call during server shutdown. */
export async function closeLdapClient(): Promise<void> {
  if (ldapClient) {
    try {
      await ldapClient.unbind();
    } catch {
      /* ignore */
    }
    ldapClient = null;
  }
  memoryCache.clear();
}
