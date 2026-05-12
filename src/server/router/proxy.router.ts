import { FastifyInstance } from 'fastify';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { agentHost } from '../utils/config.js';

interface ProxyRequestBody {
  [key: string]: unknown;
}

async function proxyRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: ProxyRequestBody }>(
    '/proxy/agent/v1/stream',
    async (request, reply) => {
      const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
      const session = request.session;
      const accessToken = session?.token?.access_token;

      if (!accessToken && process.env.AUTH_ENABLED === 'true') {
        return reply.status(401).send({ error: 'Not authenticated' });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'X-Trace-ID': traceId,
      };

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const abortController = new AbortController();

      request.raw.on('close', () => {
        abortController.abort();
      });

      try {
        const agentUrl = `${agentHost}/v1/stream`;
        fastify.log.info({ traceId, agentUrl }, 'Proxying stream request to agent');

        const agentResponse = await fetch(agentUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(request.body),
          signal: abortController.signal,
        });

        if (!agentResponse.ok) {
          fastify.log.error({ traceId, status: agentResponse.status }, 'Agent returned error');
          return reply.status(agentResponse.status).send({
            error: 'Agent request failed',
            status: agentResponse.status,
          });
        }

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Trace-ID': traceId,
        });

        if (agentResponse.body) {
          const nodeReadable = Readable.fromWeb(agentResponse.body as any);
          await pipeline(nodeReadable, reply.raw);
        } else {
          reply.raw.end();
        }
      } catch (error: unknown) {
        if ((error as Error).name === 'AbortError') {
          fastify.log.info({ traceId }, 'Client disconnected, stream aborted');
          return;
        }
        fastify.log.error({ traceId, error }, 'Proxy stream error');
        if (reply.raw.headersSent) {
          reply.raw.end();
        } else {
          reply.status(502).send({ error: 'Failed to connect to agent service' });
        }
      }
    }
  );

  fastify.all<{ Params: { '*': string } }>(
    '/proxy/agent/*',
    async (request, reply) => {
      const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
      const path = (request.params as any)['*'];
      const session = request.session;
      const accessToken = session?.token?.access_token;

      if (!accessToken && process.env.AUTH_ENABLED === 'true') {
        return reply.status(401).send({ error: 'Not authenticated' });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
      };

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      try {
        const agentUrl = `${agentHost}/${path}`;
        fastify.log.info({ traceId, method: request.method, agentUrl }, 'Proxying request to agent');

        const fetchOptions: RequestInit = {
          method: request.method,
          headers,
        };

        if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
          fetchOptions.body = JSON.stringify(request.body);
        }

        const agentResponse = await fetch(agentUrl, fetchOptions);

        reply.header('X-Trace-ID', traceId);
        reply.status(agentResponse.status);

        const contentType = agentResponse.headers.get('content-type');
        if (contentType) {
          reply.header('Content-Type', contentType);
        }

        const responseBody = await agentResponse.text();
        return reply.send(responseBody);
      } catch (error) {
        fastify.log.error({ traceId, error }, 'Proxy error');
        return reply.status(502).send({ error: 'Failed to connect to agent service' });
      }
    }
  );

  fastify.post('/proxy/agent/feedback', async (request, reply) => {
    const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
    const session = request.session;
    const accessToken = session?.token?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Trace-ID': traceId,
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const agentUrl = `${agentHost}/feedback`;
      const agentResponse = await fetch(agentUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.body),
      });

      reply.header('X-Trace-ID', traceId);
      reply.status(agentResponse.status);
      const responseBody = await agentResponse.text();
      return reply.send(responseBody);
    } catch (error) {
      fastify.log.error({ traceId, error }, 'Feedback proxy error');
      return reply.status(502).send({ error: 'Failed to send feedback' });
    }
  });

  fastify.get('/health/agent', async (request, reply) => {
    try {
      const agentResponse = await fetch(`${agentHost}/ok`, {
        signal: AbortSignal.timeout(5000),
      });
      return reply.send({
        status: agentResponse.ok ? 'healthy' : 'unhealthy',
        statusCode: agentResponse.status,
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.send({
        status: 'unreachable',
        timestamp: new Date().toISOString(),
      });
    }
  });

  fastify.post('/auth/generate-one-time-token', async (request, reply) => {
    const session = request.session;
    const accessToken = session?.token?.access_token;

    if (!accessToken && process.env.AUTH_ENABLED === 'true') {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    return reply.send({ token: accessToken || '' });
  });
}

export { proxyRoutes };
