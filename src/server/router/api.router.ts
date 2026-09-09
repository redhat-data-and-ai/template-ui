import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { handleHistoryGet, handleStreamPost } from "../controllers/v1/agent.js";
import { getSettings } from "../utils/settings.js";
import authCheckPlugin from "../plugins/auth-check.plugin.js";
import { toClientUserData } from "../utils/session-identity.js";

interface StreamRequest {
  message: string;
  thread_id: string;
  session_id: string;
  user_id: string;
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
    reply.header("Cache-Control", "public, max-age=3600");
    return cfg.branding;
  });

  fastify.get("/config/features", async (_request, reply) => {
    const cfg = getSettings();
    reply.header("Cache-Control", "public, max-age=3600");
    return cfg.features;
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

  // Vite local serves HTML without session injection. Keep this off auth-check
  // so a missing cookie returns 401 JSON instead of a /login redirect (429s SSO).
  fastify.get("/me", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store");
    if (request.session?.user) {
      return toClientUserData(request.session);
    }
    if (process.env.AUTH_ENABLED === "false") {
      return toClientUserData({
        user: {
          preferred_username: "johnwick",
          name: "John Wick",
          displayName: "John",
          email: "johnwick@redhat.com",
        },
      });
    }
    return reply.code(401).send({ error: "unauthenticated" });
  });

  // Protected routes — auth required
  await fastify.register(async (protectedRoutes) => {
    await protectedRoutes.register(authCheckPlugin);

    protectedRoutes.post("/v1/stream", async (request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) => {
      return handleStreamPost(protectedRoutes, request, reply);
    });

    protectedRoutes.get("/v1/history/:threadId", async (request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) => {
      return handleHistoryGet(protectedRoutes, request, reply);
    });
  });
}

export { apiRoutes };
