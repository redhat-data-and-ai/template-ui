import {
  OVERRIDABLE,
  readOverrides,
  writeOverrides,
} from "../utils/feature-overrides.js";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSettings, resolveAgentHost } from "../utils/settings.js";
import { toClientUserData } from "../utils/session-identity.js";

/** Bound the agent fan-out: each admin call makes an outbound /auth/whoami. */
const ADMIN_RATE_LIMIT = { rateLimit: { max: 30, timeWindow: "1 minute" } };

/**
 * One error shape across both hosts.
 *
 * The agent is FastAPI, so every failure it reports is
 * `{"detail": "..."}` — that is `HTTPException`, not a choice. This
 * server grew up saying `{"error": "..."}` instead, in about twenty
 * places. A client driving the operator endpoints hits both and has
 * to guess which key holds the message.
 *
 * Both are sent, same string. `detail` is the one to read — it is the
 * key that works against either host — and `error` stays so the
 * existing callers here keep working until they move.
 */
function errorBody(message: string): { error: string; detail: string } {
  return { error: message, detail: message };
}

async function apiRoutes(fastify: FastifyInstance) {
  // Public routes — no auth required
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  fastify.get("/version", async () => {
    return {
      version: process.env.APP_VERSION || "0.0.0",
      buildHash: process.env.BUILD_HASH || "dev",
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      environment: process.env.ENVIRONMENT || "production",
    };
  });

  fastify.get("/announcement", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async () => {
    const cfg = getSettings();
    const envMessage = process.env.ANNOUNCEMENT_MESSAGE;
    const message = envMessage || cfg.announcement.message;
    const enabled = envMessage ? true : cfg.announcement.enabled;
    if (!enabled || !message) return { enabled: false };
    return {
      enabled: true,
      message,
      type: process.env.ANNOUNCEMENT_TYPE || cfg.announcement.type,
    };
  });

  fastify.get("/config/branding", async (_request, reply) => {
    const cfg = getSettings();
    reply.header("Cache-Control", "no-store");
    return cfg.branding;
  });

  fastify.get("/config/features", async (_request, reply) => {
    const cfg = getSettings();
    reply.header("Cache-Control", "no-store");
    // Config is the default; Redis holds what an operator changed.
    // Merged on read so every consumer sees one answer rather than
    // each deciding how to combine them.
    return { ...cfg.features, ...(await readOverrides()) };
  });

  /**
   * Runtime feature flags.
   *
   * Privileged role required, checked against the session the SSO
   * login established. These decide what every user sees, so this is
   * an operator capability — the same bar as the Usage and Documents
   * surfaces.
   */
  // Rate limited per route: every call here makes an outbound
  // `/auth/whoami` to the agent before it does anything, so an
  // unbounded caller turns one request into two and fans out.
  fastify.get("/admin/features", { config: ADMIN_RATE_LIMIT }, async (request, reply) => {
    if (!(await isPrivilegedCaller(request))) {
      return reply.status(403).send(errorBody("Developer access required"));
    }
    const cfg = getSettings();
    reply.header("Cache-Control", "no-store");
    return {
      features: { ...cfg.features, ...(await readOverrides()) },
      overridable: OVERRIDABLE,
    };
  });

  fastify.put("/admin/features", { config: ADMIN_RATE_LIMIT }, async (request, reply) => {
    if (!(await isPrivilegedCaller(request))) {
      return reply.status(403).send(errorBody("Developer access required"));
    }
    try {
      const overrides = await writeOverrides(request.body);
      const cfg = getSettings();
      request.log.info({ overrides }, "feature overrides updated");
      return { features: { ...cfg.features, ...overrides } };
    } catch (error) {
      // Logged, not returned. ioredis messages carry host names and
      // sometimes credentials, and the caller can do nothing with
      // them either way.
      request.log.error({ err: error }, "feature override write failed");
      return reply.status(503).send(
        errorBody("Could not save overrides"),
      );
    }
  });

  fastify.get("/config/content", async (_request, reply) => {
    const cfg = getSettings();
    reply.header("Cache-Control", "no-store");
    return cfg.content;
  });

  fastify.get("/config/compliance", async (_request, reply) => {
    if (!fastify.hasDecorator("opa")) {
      return { enabled: false, violations: [] };
    }
    const violations = fastify.opa.evaluate();
    reply.header("Cache-Control", "no-store");
    return {
      enabled: true,
      loaded: fastify.opa.engine.isLoaded(),
      violations,
      compliant: violations.length === 0,
    };
  });

  fastify.get("/config/agent-structure", async (_request, reply) => {
    const cfg = getSettings();
    const agentHost = cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";

    try {
      const response = await fetch(`${agentHost}/config/agent-structure`, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        return reply.code(response.status).send({
          error: "Unable to load agent structure",
        });
      }

      reply.header("Cache-Control", "no-store");
      return response.json();
    } catch {
      return reply.code(502).send({ error: "Unable to reach agent" });
    }
  });

  // Vite local serves HTML without session injection. Keep this off auth-check
  // so a missing cookie returns 401 JSON instead of a /login redirect (429s SSO).
  fastify.get("/me", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store");
    if (request.session?.user) {
      return {
        ...toClientUserData(request.session),
        userRole: request.session.role ?? null,
      };
    }
    if (process.env.AUTH_ENABLED === "false") {
      return {
        ...toClientUserData({
          user: {
            preferred_username: "johnwick",
            name: "John Wick",
            displayName: "John",
            email: "johnwick@redhat.com",
          },
        }),
        userRole: null,
      };
    }
    return reply.code(401).send(errorBody("unauthenticated"));
  });

}

/**
 * One definition of "privileged", not a second copy.
 *
 * `role-resolver` already owns the set. Re-declaring it here would
 * drift the moment a role is added, and the two would disagree
 * silently about who may change a deployment-wide flag.
 */
/**
 * Is this caller an operator?
 *
 * Always asked of the agent, never decided here. The session role
 * is not consulted: this server assigns `owners` to everyone when
 * auth is off while the agent resolved the same user as `users`, so
 * two authorities disagreed about one person. One authority, one
 * answer, for the browser and for CI alike.
 *
 * The Authorization header is forwarded when present, and the
 * session's own access token when it is not. A browser does not send
 * a bearer — it sends a session cookie — so with auth *enabled* the
 * header was absent, the agent rejected the unauthenticated call, and
 * `!res.ok` turned that into a flat `false`: both admin endpoints
 * answered 403 to the very people allowed to use them. With auth
 * disabled there is neither, and the agent says so itself rather than
 * this server guessing on its behalf.
 */
async function isPrivilegedCaller(request: {
  headers?: Record<string, unknown>;
  session?: { token?: { access_token?: string } };
}): Promise<boolean> {
  try {
    const host = resolveAgentHost();
    const header = request.headers?.authorization;
    const sessionToken = request.session?.token?.access_token;
    const auth =
      typeof header === "string"
        ? header
        : sessionToken
          ? `Bearer ${sessionToken}`
          : undefined;
    const res = await fetch(`${host}/auth/whoami`, {
      headers: auth ? { Authorization: auth } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { is_developer?: boolean | null };
    // `null` means the role lookup failed. Anything other than a
    // clear yes is a no — an outage must not grant access.
    return body.is_developer === true;
  } catch {
    return false;
  }
}

export { apiRoutes };
