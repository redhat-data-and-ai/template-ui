import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { handleHistoryGet, handleStreamPost, handleThreadsGet, handleFeedbackPost } from "../controllers/v1/agent.js";

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

  fastify.get("/v1/users/:userId/threads", async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    handleThreadsGet(fastify, request, reply);
  });

  fastify.get("/v1/users/:userId/history/:threadId", async (request: FastifyRequest<{ Params: { userId: string; threadId: string } }>, reply: FastifyReply) => {
    handleHistoryGet(fastify, request, reply);
  });

  fastify.post("/v1/feedback", async (request: FastifyRequest<{ Body: { run_id: string; key: string; score: number; kwargs: Record<string, any> } }>, reply: FastifyReply) => {
    handleFeedbackPost(fastify, request, reply);
  });
}

export { apiRoutes };
