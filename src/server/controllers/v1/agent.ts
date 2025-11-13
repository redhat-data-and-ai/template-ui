import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { agentHost } from "../../utils/config.js";

interface StreamRequest {
  message: string;
  thread_id: string;
  session_id: string;
  user_id: string;
}

export async function handleStreamPost(fastify: FastifyInstance, request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) {
  const { message, thread_id, session_id, user_id } = request.body;

  // Extract SSO access token from session
  const accessToken = request.session?.token?.access_token;
  
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
    // Prepare headers for agent request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    };

    // Add SSO token if present
    if (accessToken) {
      headers['X-Token'] = accessToken;
    }

    // Proxy request to agent backend
    const agentUrl = `${agentHost}/v1/stream`;
    fastify.log.info(`Proxying to agent: ${agentUrl}`);

    const agentResponse = await fetch(agentUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        thread_id,
        session_id,
        user_id,
        stream_tokens: true
      })
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
  
  // Extract SSO access token from session
  const accessToken = request.session?.token?.access_token;
  
  fastify.log.info(`History request for thread: ${threadId}, Token: ${accessToken ? 'Present' : 'Missing'}`);

  try {
    // Prepare headers for agent request
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add SSO token if present
    if (accessToken) {
      headers['X-Token'] = accessToken;
    }

    // Proxy request to agent backend
    const agentUrl = `${agentHost}/v1/history/${threadId}`;
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