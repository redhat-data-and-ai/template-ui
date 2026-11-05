import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ProbeAwareLogController } from '../server.js';
import { buildTestServer } from './test-utils.js';

/**
 * Health-probe traffic was 100% of the UI pod's log volume (~33k lines over 14h),
 * because Fastify logs two pino lines per request ("incoming request" and
 * "request completed") and the kubelet probes /api/health every 5s and 10s.
 *
 * ProbeAwareLogController drops the first line always and the second one for
 * successful probes only. The controller is exercised directly rather than
 * through a live server: pino writes to fd 1 via sonic-boom, so spying on
 * process.stdout.write captures nothing and such assertions pass vacuously.
 */
describe('request logging', () => {
  function fakeRequest(url: string, method = 'GET') {
    const info = vi.fn();
    const error = vi.fn();
    const log = { info, error };
    return {
      request: { url, method, log, raw: { url, method } } as unknown as FastifyRequest,
      info,
      error,
    };
  }

  function fakeReply(statusCode: number, log: unknown) {
    return { statusCode, elapsedTime: 1.23, log } as unknown as FastifyReply;
  }

  function complete(url: string, statusCode: number, err: Error | null = null) {
    const controller = new ProbeAwareLogController();
    const { request, info, error } = fakeRequest(url);
    controller.requestCompleted(err, request, fakeReply(statusCode, request.log), undefined);
    return { info, error };
  }

  describe('requestCompleted', () => {
    it.each(['/api/health', '/_health'])(
      'logs nothing for a successful probe on %s',
      (path) => {
        const { info, error } = complete(path, 200);
        expect(info).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
      },
    );

    it('ignores the query string when matching probe paths', () => {
      expect(complete('/api/health?verbose=1', 200).info).not.toHaveBeenCalled();
    });

    it('logs a non-probe request', () => {
      const { info } = complete('/api/version', 200);
      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0][1]).toBe('request completed');
    });

    // Delegating to super keeps fastify's res serializer, which is also what
    // supplies host/remoteAddress/remotePort on the incoming line — the only
    // place this pod logs a client address.
    it('delegates to the base class so the serializers still run', () => {
      const { info } = complete('/api/version?x=1', 200);
      expect(info.mock.calls[0][0]).toMatchObject({ res: { statusCode: 200 } });
    });

    it('logs an errored request via the base class', () => {
      const { error } = complete('/api/thing', 500, new Error('boom'));
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][1]).toBe('request errored');
    });

    it.each([404, 500])('still logs a probe path that fails with %i', (status) => {
      const { info } = complete('/api/health', status);
      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0][0].res.statusCode).toBe(status);
    });

    it('still logs a probe path that errors', () => {
      const { error } = complete('/api/health', 200, new Error('boom'));
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][1]).toBe('request errored');
    });

    it('does not treat the user-facing agent status route as a probe', () => {
      expect(complete('/api/health/agent', 200).info).toHaveBeenCalledTimes(1);
    });
  });

  describe('incomingRequest', () => {
    function incoming(url: string) {
      const controller = new ProbeAwareLogController();
      const { request, info } = fakeRequest(url);
      controller.incomingRequest(request, fakeReply(200, request.log), undefined);
      return info;
    }

    it.each(['/api/health', '/_health', '/api/health?x=1'])(
      'stays silent for probe %s',
      (url) => expect(incoming(url)).not.toHaveBeenCalled(),
    );

    /**
     * The hijacked chat stream skips `reply.raw.end()` when the client
     * disconnects, so `finish` never fires and `requestCompleted` never runs.
     * This line is then the only record that the request happened at all —
     * no-oping it would make abandoned chats invisible.
     */
    it('logs a non-probe request so aborted streams leave a trace', () => {
      const info = incoming('/api/proxy/agent/threads/abc/runs/stream');
      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0][1]).toBe('incoming request');
    });
  });

  describe('error paths inherited from the base controller', () => {
    it('keeps logging 5xx handled by the default error handler', () => {
      const controller = new ProbeAwareLogController();
      const { request, error } = fakeRequest('/api/health');
      const reply = fakeReply(500, request.log);
      controller.defaultErrorLog(new Error('boom'), request, reply, undefined);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('keeps logging route-not-found', () => {
      const controller = new ProbeAwareLogController();
      const { request, info } = fakeRequest('/nope');
      controller.routeNotFound(request, fakeReply(404, request.log), undefined);
      expect(info).toHaveBeenCalledTimes(1);
    });
  });

  describe('server wiring', () => {
    let server: FastifyInstance;

    beforeAll(async () => {
      server = await buildTestServer();
      await server.ready();
    });

    afterAll(async () => {
      await server.close();
    });

    it('serves the probe paths the controller exempts', async () => {
      for (const url of ['/api/health', '/_health']) {
        const res = await server.inject({ method: 'GET', url });
        expect(res.statusCode, `${url} should be a live 200 route`).toBe(200);
      }
    });
  });
});
