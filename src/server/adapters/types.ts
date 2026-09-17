import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Body accepted by the UI's fixed streaming contract (`POST /proxy/agent/v1/stream`).
 * Every adapter receives exactly this shape regardless of what the underlying
 * agent engine's own wire format looks like.
 */
export interface StreamRequestBody {
  message: string;
  thread_id: string;
  user_id?: string;
  session_id?: string;
  stream_tokens?: boolean;
  /** Resume a paused HITL run. Adapters that don't support HITL (e.g. simple-rest) should reject this. */
  resume?: boolean;
  project_id?: string | null;
}

/**
 * The contract every agent-protocol adapter must implement. `proxy.router.ts`
 * only knows about this interface — it never talks to LangGraph Platform or
 * Harbor Agent (or any future engine) directly. Each method is responsible
 * for translating between the UI's fixed BFF contract (SSE chunk stream with
 * `chunk_id`, thread search/state/delete/feedback shapes consumed by
 * `src/frontend/services/agent-rest.ts` and `feedback-api.ts`) and whatever
 * wire protocol the configured `agent.protocol` speaks.
 *
 * See `./langgraph.adapter.ts` (LangGraph Platform / Aegra) and
 * `./simple-rest.adapter.ts` (plain REST + NDJSON, e.g. Harbor Agent) for
 * reference implementations, and `docs/deployment-patterns.md` for how to
 * add a new one.
 */
export interface AgentAdapter {
  /** POST /proxy/agent/v1/stream — writes an SSE stream of UI chunks and ends with `data: [DONE]\n\n`. */
  handleStream(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Body: StreamRequestBody }>,
    reply: FastifyReply,
  ): Promise<void>;

  /** POST /proxy/agent/threads/search — returns the thread list for the sidebar. */
  searchThreads(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<void>;

  /** GET /proxy/agent/threads/:threadId/state — returns `{ values: { messages }, tasks }` for a single thread. */
  getThreadState(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;

  /** DELETE /proxy/agent/threads/:threadId */
  deleteThread(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;

  /** POST /proxy/agent/feedback */
  submitFeedback(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<void>;

  /**
   * GET /proxy/agent/feedback/:threadId — returns `{ feedback: [{ message_id, feedback: 'up'|'down' }] }`.
   * Optional: engines with no feedback-retrieval API (e.g. Harbor Agent) may omit this;
   * the router falls back to `{ feedback: [] }` so the UI degrades gracefully.
   */
  getThreadFeedback?(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;
}
