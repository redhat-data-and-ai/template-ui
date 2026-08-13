import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSettings } from '../utils/settings.js';
import { bombardEndpoint } from './test-utils.js';

/**
 * The auth plugin is wrapped with fastify-plugin, so a global @fastify/rate-limit
 * registered inside it applies to every route. These tests lock the intended
 * behavior: only /login and /auth/* are limited; API/static traffic is not.
 */
vi.mock('@fastify/oauth2', () => ({
  default: async (fastify: {
    decorate: (name: string, value: unknown) => void;
  }) => {
    fastify.decorate('redhatSSO', {
      generateAuthorizationUri: (
        _request: unknown,
        reply: { redirect: (url: string) => void },
        cb: (err: Error | null, url: string) => void,
      ) => {
        cb(null, 'https://example.com/authorize');
        reply.redirect('https://example.com/authorize');
      },
      getNewAccessTokenUsingRefreshToken: async () => ({
        token: { access_token: 'test-token' },
      }),
      userinfo: async () => ({ sub: 'test-user' }),
      getAccessTokenFromAuthorizationCodeFlow: async () => ({
        token: { access_token: 'test-token' },
      }),
    });
  },
}));

describe('Security: Auth plugin rate limit scope', () => {
  beforeEach(() => {
    process.env.FEATURE_AUTH_ENABLED = 'true';
    process.env.AUTH_ENABLED = 'true';
    process.env.SSO_CLIENT_ID = 'test-client';
    process.env.SSO_CLIENT_SECRET = 'test-secret';
    process.env.SSO_ISSUER_HOST = 'https://sso.example.com';
    process.env.SSO_CALLBACK_URL = 'http://localhost:8080/auth/callback/oidc';
    process.env.COOKIE_SIGN = 'test-secret-value-that-is-32chars!!';
    // Isolate from the separate security.rate_limit limiter
    resetSettings();
  });

  afterEach(() => {
    delete process.env.FEATURE_AUTH_ENABLED;
    delete process.env.AUTH_ENABLED;
    delete process.env.SSO_CLIENT_ID;
    delete process.env.SSO_CLIENT_SECRET;
    delete process.env.SSO_ISSUER_HOST;
    delete process.env.SSO_CALLBACK_URL;
    delete process.env.COOKIE_SIGN;
    delete process.env.RATE_LIMIT_MAX;
    resetSettings();
    vi.resetModules();
  });

  async function buildAuthServer() {
    const { setupServer } = await import('../server.js');
    return setupServer();
  }

  it('does NOT apply the auth 20/min limit to non-auth API routes', async () => {
    const server = await buildAuthServer();
    try {
      const responses = await bombardEndpoint(server, '/api/announcement', 25);
      const rateLimited = responses.filter((r) => r.statusCode === 429);
      expect(rateLimited.length).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('still rate-limits auth routes at 20 requests per minute', async () => {
    const server = await buildAuthServer();
    try {
      const responses = await bombardEndpoint(server, '/login', 25);
      const rateLimited = responses.filter((r) => r.statusCode === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });
});
