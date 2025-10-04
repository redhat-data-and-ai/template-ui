import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { handleHistoryGet, handleStreamPost } from "../controllers/v1/agent.js";

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

  fastify.post("/v1/stream", async (request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) => {
   handleStreamPost(fastify, request, reply);
  });

  fastify.get("/v1/history/:threadId", async (request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) => {
    handleHistoryGet(fastify, request, reply);
  });
}

export { apiRoutes };
