import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { getSettings } from "../utils/settings.js";

function getAgentHost(): string {
  const cfg = getSettings();
  return cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";
}

async function fetchAgentConsent(accessToken: string): Promise<{ has_consent: boolean; granted_at: string | null } | null> {
  try {
    const resp = await fetch(`${getAgentHost()}/personalization/consent`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) return (await resp.json()) as { has_consent: boolean; granted_at: string | null };
  } catch { /* agent unreachable */ }
  return null;
}

function verifyCsrfOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
  const origin = request.headers.origin;
  if (!origin) {
    reply.code(403).send({ error: "missing_origin", message: "Origin header is required" });
    return false;
  }
  try {
    const fwdProto = (request.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim();
    const proto = (fwdProto === "https" || fwdProto === "http") ? fwdProto : request.protocol;
    const allowed = new URL(`${proto}://${request.host}`).origin;
    if (new URL(origin).origin !== allowed) {
      reply.code(403).send({ error: "cross_origin_denied", message: "Cross-origin request rejected" });
      return false;
    }
  } catch {
    reply.code(403).send({ error: "invalid_origin", message: "Invalid Origin header" });
    return false;
  }
  return true;
}

const CONSENT_RATE_LIMIT = {
  config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
} as const;

async function consentRoutes(fastify: FastifyInstance) {
  await fastify.register(import("@fastify/rate-limit"), {
    global: false,
    max: 20,
    timeWindow: "1 minute",
  });

  fastify.post("/auth/consent/approve", CONSENT_RATE_LIMIT, async (request, reply) => {
    if (process.env.AUTH_ENABLED !== "false" && !verifyCsrfOrigin(request, reply)) return reply;
    const session = (request as any).session;
    if (!session?.user) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    const token = session.token?.access_token;
    try {
      const resp = await fetch(`${getAgentHost()}/personalization/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-User-ID": session.user.preferred_username || session.user.sub || "",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`Agent returned ${resp.status}`);
      const data = (await resp.json()) as { granted_at?: string };
      session.consentApproved = true;
      session.consentGrantedAt = data.granted_at;
    } catch (err) {
      session.consentApproved = true;
      session.consentGrantedAt = new Date().toISOString();
      fastify.log.warn({ err }, "Agent consent store failed, session-only fallback");
    }

    const redirectUrl = session.postConsentRedirect ?? "/";
    delete session.postConsentRedirect;
    return reply.send({ message: "Consent approved", redirectUrl });
  });

  fastify.get("/auth/consent/status", CONSENT_RATE_LIMIT, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const session = (request as any).session;

    if (session?.consentApproved) {
      return reply.send({ hasConsent: true, grantedAt: session.consentGrantedAt ?? null });
    }

    const token = session?.token?.access_token;
    if (token) {
      const agentConsent = await fetchAgentConsent(token);
      if (agentConsent?.has_consent) {
        session.consentApproved = true;
        session.consentGrantedAt = agentConsent.granted_at;
        return reply.send({ hasConsent: true, grantedAt: agentConsent.granted_at });
      }
    }

    return reply.send({ hasConsent: false, grantedAt: null });
  });

  fastify.post("/auth/consent/revoke", CONSENT_RATE_LIMIT, async (request, reply) => {
    if (process.env.AUTH_ENABLED !== "false" && !verifyCsrfOrigin(request, reply)) return reply;
    const session = (request as any).session;
    if (!session?.user) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    const token = session.token?.access_token;
    try {
      const resp = await fetch(`${getAgentHost()}/personalization/consent`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-User-ID": session.user.preferred_username || session.user.sub || "",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        fastify.log.error({ status: resp.status }, "Agent consent revoke returned non-2xx");
        return reply.code(502).send({ error: "revoke_failed", message: "Failed to revoke consent on the agent" });
      }
    } catch (err) {
      fastify.log.error({ err }, "Agent consent revoke failed");
      return reply.code(502).send({ error: "revoke_failed", message: "Agent unreachable during consent revocation" });
    }

    session.consentApproved = false;
    delete session.consentGrantedAt;
    return reply.send({ message: "Consent revoked" });
  });
}

export const consentPlugin = fp(consentRoutes, { name: "consent-plugin" });
