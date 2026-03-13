import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { handleCancelDelete, handleHistoryGet, handleStreamPost } from "../controllers/v1/agent.js";

interface StreamRequest {
  message: string;
  thread_id: string;
  session_id: string;
  user_id: string;
  [key: string]: unknown;
}

async function apiRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  fastify.post("/v1/stream", async (request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) => {
    await handleStreamPost(fastify, request, reply);
  });

  fastify.get("/v1/history/:threadId", async (request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) => {
    await handleHistoryGet(fastify, request, reply);
  });

  fastify.delete("/v1/cancel/:threadId", async (request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) => {
    await handleCancelDelete(fastify, request, reply);
  });
}

export { apiRoutes };
