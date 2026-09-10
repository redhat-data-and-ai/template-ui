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

const memoryCache = new Map<string, { result: boolean; ts: number }>();

let ldapClient: Client | null = null;
let bindFailed = false;

function getCacheTtl(): number {
  return parseInt(process.env.LDAP_CACHE_TTL_SECONDS || "300", 10) * 1000;
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
    return "dc=redhat,dc=com";
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
  const ldapUrl = process.env.LDAP_URL || "";
  const baseDn = deriveBaseDn(ldapUrl);
  const uid = process.env.LDAP_BASE_UID || "";
  if (uid.includes(",")) return uid;
  return `uid=${uid},ou=users,${baseDn}`;
}

function getMemberAttrs(): string[] {
  const envVal = process.env.LDAP_MEMBER_ATTRS;
  if (envVal) return envVal.split(",").map((a) => a.trim());
  return ["member", "uniqueMember", "memberUid"];
}

async function ensureBound(): Promise<Client | null> {
  const ldapUrl = process.env.LDAP_URL;
  if (!ldapUrl) return null;

  if (ldapClient && !bindFailed) return ldapClient;

  const password = process.env.LDAP_PASSWORD || "";
  const bindDn = getBindDn();
  const connectTimeout =
    parseInt(process.env.LDAP_CONNECT_TIMEOUT || "10", 10) * 1000;

  try {
    ldapClient = new Client({
      url: ldapUrl,
      connectTimeout,
      tlsOptions: { rejectUnauthorized: false },
    });
    await ldapClient.bind(bindDn, password);
    bindFailed = false;
    return ldapClient;
  } catch (err) {
    console.error("[LDAP] Bind failed:", (err as Error).message);
    bindFailed = true;
    ldapClient = null;
    return null;
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

  const client = await ensureBound();
  if (!client) return false;

  const searchBase = getGroupSearchBase();
  const ldapUrl = process.env.LDAP_URL || "";
  const baseDn = deriveBaseDn(ldapUrl);
  const memberAttrs = getMemberAttrs();
  const userAttr = process.env.LDAP_USER_ATTR || "uid";

  try {
    const { searchEntries } = await client.search(searchBase, {
      scope: "sub",
      filter: `(cn=${groupCn})`,
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
            memberLower ===
              `${userAttr}=${userId.toLowerCase()},ou=users,${baseDn}` ||
            memberLower.startsWith(
              `${userAttr}=${userId.toLowerCase()},`,
            )
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
    bindFailed = true;
    return false;
  }
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
