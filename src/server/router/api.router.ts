import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { handleHistoryGet, handleStreamPost } from "../controllers/v1/agent.js";
import { getSettings } from "../utils/settings.js";

interface StreamRequest {
  message: string;
  thread_id: string;
  session_id: string;
  user_id: string;
}

async function apiRoutes(fastify: FastifyInstance) {
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

  fastify.get("/announcement", async () => {
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

  fastify.post("/v1/stream", async (request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) => {
   handleStreamPost(fastify, request, reply);
  });

  fastify.get("/v1/history/:threadId", async (request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) => {
    handleHistoryGet(fastify, request, reply);
  });
}

export { apiRoutes };
