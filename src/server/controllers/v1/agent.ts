import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { agentHost } from "../../utils/config.js";

const PROXY_TIMEOUT_MS = 10_000;

interface StreamRequest {
  message: string;
  thread_id: string;
  session_id: string;
  user_id: string;
  stream_tokens?: boolean;
  deep_research_enabled?: boolean;
  deep_research_require_plan_approval?: boolean;
  deep_research_model?: string;
  deep_research_max_mode?: boolean;
  deep_research_max_subqueries?: number;
}

export async function handleStreamPost(fastify: FastifyInstance, request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) {
  const {
    message, thread_id, session_id, user_id,
    stream_tokens, deep_research_enabled,
    deep_research_require_plan_approval, deep_research_model,
    deep_research_max_mode, deep_research_max_subqueries,
  } = request.body;

  const accessToken = request.session?.token?.access_token;
  
  fastify.log.info({ thread_id, user_id, hasToken: !!accessToken }, "Stream request");

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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    };

    if (accessToken) {
      headers['X-Token'] = accessToken;
    }

    const agentUrl = `${agentHost}/v1/stream`;
    fastify.log.info({ agentUrl }, "Proxying to agent");

    const agentResponse = await fetch(agentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message, thread_id, session_id, user_id,
        stream_tokens: stream_tokens ?? true,
        deep_research_enabled, deep_research_require_plan_approval,
        deep_research_model, deep_research_max_mode,
        deep_research_max_subqueries,
      })
    });

    if (!agentResponse.ok) {
      throw new Error(`Agent responded with status ${agentResponse.status}`);
    }

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
    fastify.log.error({ err: error }, "Error proxying stream to agent");
    
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
  const accessToken = request.session?.token?.access_token;
  
  fastify.log.info({ threadId, hasToken: !!accessToken }, "History request");

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (accessToken) {
    headers['X-Token'] = accessToken;
  }

  const agentUrl = `${agentHost}/v1/history/${threadId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    fastify.log.info({ agentUrl }, "Proxying to agent");

    const agentResponse = await fetch(agentUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!agentResponse.ok) {
      fastify.log.error({ threadId, status: agentResponse.status }, "Agent returned error status");
      return reply.status(agentResponse.status).send({
        error: 'Failed to fetch history from agent',
        status: agentResponse.status
      });
    }

    const history = await agentResponse.json();
    reply.send(history);

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      fastify.log.error({ threadId }, "History request timed out");
      return reply.status(504).send({ error: 'Agent request timed out' });
    }
    fastify.log.error({ err: error }, "Error proxying history to agent");
    reply.status(500).send({ error: 'Failed to connect to agent service' });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Proxies a cancel request to the backend agent.
 * Auth is delegated: the BFF forwards the session token via X-Token header;
 * the backend agent validates token ownership of the thread.
 */
export async function handleCancelDelete(fastify: FastifyInstance, request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) {
  const { threadId } = request.params;
  const accessToken = request.session?.token?.access_token;
  
  fastify.log.info({ threadId }, "Cancel request received");

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (accessToken) {
    headers['X-Token'] = accessToken;
  }

  const agentUrl = `${agentHost}/v1/cancel/${threadId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const agentResponse = await fetch(agentUrl, {
      method: 'DELETE',
      headers,
      signal: controller.signal,
    });

    if (!agentResponse.ok) {
      return reply.status(agentResponse.status).send({
        error: 'Failed to cancel research',
        status: agentResponse.status
      });
    }

    const result = await agentResponse.json();
    reply.send(result);

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      fastify.log.error({ threadId }, "Cancel request timed out");
      return reply.status(504).send({ error: 'Agent request timed out' });
    }
    fastify.log.error({ err: error }, "Error proxying cancel to agent");
    reply.status(500).send({ error: 'Failed to connect to agent service' });
  } finally {
    clearTimeout(timeout);
  }
}
