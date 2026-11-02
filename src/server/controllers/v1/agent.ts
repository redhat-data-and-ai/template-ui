import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getSettings } from "../../utils/settings.js";

function getAgentHost(): string {
  const cfg = getSettings();
  return cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";
}

function getRouterUrl(): string {
  return process.env.DVA_ROUTER_URL || "http://localhost:8090";
}

interface StreamRequest {
  message: string;
  thread_id: string;
  session_id: string;
  user_id: string;
}

interface DvaClassification {
  intents: Array<{ intent_class: string; confidence: number }>;
  routing?: {
    success: boolean;
    decision: string;
    selected_product: string | null;
    data_products: Array<{ name: string; confidence: number }>;
    reasoning: string;
  } | null;
  reasoning: string;
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function resolveAccessToken(request: FastifyRequest): string | undefined {
  return (
    request.session?.token?.access_token ||
    headerValue(request, "x-auth-access-token") ||
    headerValue(request, "x-token")
  );
}

export async function handleStreamPost(fastify: FastifyInstance, request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) {
  const { message, thread_id, session_id, user_id } = request.body;

  const accessToken = resolveAccessToken(request);
  
  fastify.log.info(`Stream request - Thread: ${thread_id}, User: ${user_id}, Token: ${accessToken ? 'Present' : 'Missing'}`);

  // Set SSE headers
  reply.headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Origin, X-Requested-With, Cache-Control, X-Token',
    'Access-Control-Allow-Credentials': 'true'
  });

  try {
    // ── DVA 2.0: Pre-classify the query via dv-gemma-router ──
    let dvaClassification: DvaClassification | undefined;
    try {
      const routerUrl = getRouterUrl();
      const classifyRes = await fetch(`${routerUrl}/api/v1/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: message }),
        signal: AbortSignal.timeout(10_000),
      });
      if (classifyRes.ok) {
        dvaClassification = (await classifyRes.json()) as DvaClassification;
        fastify.log.info(
          `DVA classification: intents=[${dvaClassification.intents.map(i => i.intent_class).join(", ")}] product=${dvaClassification.routing?.selected_product ?? "none"}`
        );
        reply.raw.write(
          `data: ${JSON.stringify({ type: "dva_classification", content: dvaClassification })}\n\n`
        );
      } else {
        fastify.log.warn(`DVA router responded with status ${classifyRes.status}`);
      }
    } catch (classifyErr) {
      fastify.log.warn(`DVA classification unavailable, proceeding without: ${classifyErr}`);
    }

    // Prepare headers for agent request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const agentUrl = `${getAgentHost()}/v1/stream`;
    fastify.log.info(`Proxying to agent: ${agentUrl}`);

    // Build agent request body with optional DVA classification metadata
    const agentBody: Record<string, unknown> = {
      message,
      thread_id,
      session_id,
      user_id,
      stream_tokens: true,
    };
    if (dvaClassification) {
      agentBody.config = {
        metadata: {
          dva_classification: dvaClassification,
        },
      };
    }

    const agentResponse = await fetch(agentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentBody),
    });

    if (!agentResponse.ok) {
      throw new Error(`Agent responded with status ${agentResponse.status}`);
    }

    // Stream response from agent to client
    const reader = agentResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body from agent');
    }

    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      reply.raw.write(chunk);
    }

    reply.raw.end();

  } catch (error) {
    fastify.log.error(`Error proxying to agent: ${error}`);
    
    // Send error event to client
    const errorEvent = JSON.stringify({
      type: "error",
      content: {
        message: "Failed to connect to agent service",
        recoverable: false,
        error_type: "proxy_error"
      }
    });
    
    reply.raw.write(`${errorEvent}\n\n`);
    reply.raw.write('[DONE]\n\n');
    reply.raw.end();
  }
}

export async function handleHistoryGet(fastify: FastifyInstance, request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) {
  const { threadId } = request.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(threadId)) {
    return reply.status(400).send({ error: "Invalid thread ID" });
  }

  const accessToken = resolveAccessToken(request);

  fastify.log.info(`History request for thread: ${threadId}, Token: ${accessToken ? 'Present' : 'Missing'}`);

  try {
    // Prepare headers for agent request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const agentUrl = `${getAgentHost()}/v1/history/${threadId}`;
    fastify.log.info(`Proxying to agent: ${agentUrl}`);

    const agentResponse = await fetch(agentUrl, {
      method: 'GET',
      headers
    });

    if (!agentResponse.ok) {
      fastify.log.error(`Agent responded with status ${agentResponse.status}`);
      return reply.status(agentResponse.status).send({
        error: 'Failed to fetch history from agent',
        status: agentResponse.status
      });
    }

    const history = await agentResponse.json();
    reply.send(history);

  } catch (error) {
    fastify.log.error(`Error proxying to agent: ${error}`);
    reply.status(500).send({
      error: 'Failed to connect to agent service',
      message: String(error)
    });
  }
}