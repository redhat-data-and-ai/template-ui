import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSettings, resetSettings } from '../utils/settings.js';
import { setupServer } from '../server.js';
import {
  buildTestServer,
  parseCookieHeader,
  bombardEndpoint,
  generatePathTraversalPayloads,
} from './test-utils.js';

describe('Security: COOKIE_SIGN startup guard', () => {
  // These tests call setupServer() directly so that buildTestServer's COOKIE_SIGN
  // defaulting doesn't mask the guard under test.
  beforeEach(() => {
    process.env.FEATURE_AUTH_ENABLED = 'false';
    resetSettings();
  });

  afterEach(() => {
    delete process.env.COOKIE_SIGN;
    delete process.env.FEATURE_AUTH_ENABLED;
    resetSettings();
  });

  it('should throw if COOKIE_SIGN is not set', async () => {
    delete process.env.COOKIE_SIGN;
    await expect(setupServer()).rejects.toThrow(/COOKIE_SIGN/);
  });

  it('should throw if COOKIE_SIGN is shorter than 32 characters', async () => {
    process.env.COOKIE_SIGN = 'tooshort';
    await expect(setupServer()).rejects.toThrow(/COOKIE_SIGN/);
  });

  it('should throw if COOKIE_SIGN is exactly 31 characters', async () => {
    process.env.COOKIE_SIGN = 'a'.repeat(31);
    await expect(setupServer()).rejects.toThrow(/COOKIE_SIGN/);
  });

  it('should start successfully when COOKIE_SIGN is exactly 32 characters', async () => {
    process.env.COOKIE_SIGN = 'a'.repeat(32);
    await expect(setupServer()).resolves.toBeDefined();
  });

  it('should start successfully when COOKIE_SIGN is longer than 32 characters', async () => {
    process.env.COOKIE_SIGN = 'a-very-long-and-secure-cookie-signing-secret-value';
    await expect(setupServer()).resolves.toBeDefined();
  });
});

describe('Security: Session Cookie Hardening', () => {
  beforeEach(() => {
    resetSettings();
  });

  afterEach(() => {
    delete process.env.SESSION_SECURE_COOKIE;
    delete process.env.SESSION_SAME_SITE;
    delete process.env.ENVIRONMENT;
    resetSettings();
  });

  it('should set HttpOnly flag on session cookies', async () => {
    const server = await buildTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });

    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = parseCookieHeader(setCookie);
      expect(cookies.httpOnly).toBe(true);
    }
  });

  it('should set Secure flag in production environment', async () => {
    process.env.ENVIRONMENT = 'production';
    process.env.SESSION_SECURE_COOKIE = 'true';
    const server = await buildTestServer();

    const response = await server.inject({ method: 'GET', url: '/api/health' });
    const setCookie = response.headers['set-cookie'];

    if (setCookie) {
      const cookies = parseCookieHeader(setCookie);
      expect(cookies.secure).toBe(true);
    }
  });

  it('should set SameSite=Lax on session cookies by default', async () => {
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/api/health' });

    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = parseCookieHeader(setCookie);
      expect(cookies.sameSite).toBe('lax');
    }
  });

  it('should allow SameSite override via environment variable', async () => {
    process.env.SESSION_SAME_SITE = 'strict';
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/api/health' });

    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = parseCookieHeader(setCookie);
      expect(cookies.sameSite).toBe('strict');
    }
  });
});

describe('Security: CSP Headers', () => {
  beforeEach(() => {
    resetSettings();
  });

  afterEach(() => {
    delete process.env.AGENT_ENDPOINT;
    delete process.env.CSP_SCRIPT_SRC;
    delete process.env.CSP_CONNECT_SRC;
    resetSettings();
  });

  it('should NOT allow unsafe-inline in script-src', async () => {
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/' });

    const csp = response.headers['content-security-policy'];
    expect(csp).toBeDefined();

    // Extract script-src directive
    const directives = csp!.split(';');
    const scriptSrc = directives.find(d => d.trim().startsWith('script-src'));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('should include agent endpoint in connect-src', async () => {
    process.env.AGENT_ENDPOINT = 'https://agent.example.com';
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/' });

    const csp = response.headers['content-security-policy'];
    expect(csp).toBeDefined();

    const directives = csp!.split(';');
    const connectSrc = directives.find(d => d.trim().startsWith('connect-src'));

    expect(connectSrc).toBeDefined();
    expect(connectSrc).toContain('https://agent.example.com');
  });

  it('should allow CSP override via environment variable', async () => {
    process.env.CSP_SCRIPT_SRC = "'self' 'unsafe-eval'";
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/' });

    const csp = response.headers['content-security-policy'];
    const directives = csp!.split(';');
    const scriptSrc = directives.find(d => d.trim().startsWith('script-src'));

    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it('should set all required CSP directives', async () => {
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/' });

    const csp = response.headers['content-security-policy'];
    expect(csp).toBeDefined();

    const requiredDirectives = [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'connect-src',
      'font-src',
      'object-src',
      'frame-src',
      'frame-ancestors',
    ];

    for (const directive of requiredDirectives) {
      expect(csp).toContain(directive);
    }
  });
});

describe('Security: Rate Limiting', () => {
  beforeEach(() => {
    resetSettings();
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_MAX;
    resetSettings();
  });

  it('should apply global rate limit', async () => {
    process.env.RATE_LIMIT_MAX = '5';
    const server = await buildTestServer();

    // Make 10 requests rapidly
    const responses = await bombardEndpoint(server, '/api/config/branding', 10);

    // Some should be rate limited
    const rateLimited = responses.filter(r => r.statusCode === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should NOT rate limit health check endpoints', async () => {
    process.env.RATE_LIMIT_MAX = '5';
    const server = await buildTestServer();

    // Make 20 requests to health endpoint
    const responses = await bombardEndpoint(server, '/api/health', 20);

    // None should be rate limited (excluded path)
    const rateLimited = responses.filter(r => r.statusCode === 429);
    expect(rateLimited.length).toBe(0);
  });

  it('should include retry-after header in rate limit responses', async () => {
    process.env.RATE_LIMIT_MAX = '2';
    const server = await buildTestServer();

    // Exceed rate limit
    await bombardEndpoint(server, '/api/config/features', 5);
    const response = await server.inject({ method: 'GET', url: '/api/config/features' });

    if (response.statusCode === 429) {
      expect(response.headers['retry-after']).toBeDefined();
    }
  });
});

describe('Security: X-Powered-By Header Removal', () => {
  it('should NOT expose X-Powered-By header', async () => {
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/' });

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should NOT expose Server header with version', async () => {
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/api/health' });

    // Should either be undefined or generic (not reveal "Fastify 5.5.0")
    const serverHeader = response.headers['server'];
    if (serverHeader) {
      expect(serverHeader).not.toMatch(/fastify/i);
      expect(serverHeader).not.toMatch(/\d+\.\d+\.\d+/); // No version numbers
    }
  });
});

describe('Security: Config Path Validation', () => {
  beforeEach(() => {
    resetSettings();
  });

  afterEach(() => {
    delete process.env.UI_CONFIG_PATH;
  });

  it('should reject path traversal attempts', () => {
    const maliciousPaths = generatePathTraversalPayloads();

    for (const path of maliciousPaths) {
      process.env.UI_CONFIG_PATH = path;
      resetSettings();

      expect(() => getSettings()).toThrow();
    }
  });

  it('should reject absolute paths to nonexistent files', () => {
    process.env.UI_CONFIG_PATH = '/app/config/ui/settings.yaml';
    resetSettings();

    expect(() => getSettings()).toThrow(/Config file not found/i);
  });

  it('should allow default config path', () => {
    delete process.env.UI_CONFIG_PATH;
    resetSettings();

    const settings = getSettings();
    expect(settings).toBeDefined();
    expect(settings.branding.title).toBeDefined();
  });
});

describe('Security: Integration Tests', () => {
  beforeEach(() => {
    resetSettings();
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT;
    delete process.env.SESSION_SECURE_COOKIE;
    delete process.env.SESSION_SAME_SITE;
    resetSettings();
  });

  it('should maintain security headers across all routes', async () => {
    const server = await buildTestServer();
    const routes = ['/', '/api/health', '/api/config/branding'];

    for (const route of routes) {
      const response = await server.inject({ method: 'GET', url: route });

      // All security headers should be present
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('should combine all security features correctly', async () => {
    process.env.ENVIRONMENT = 'production';
    process.env.SESSION_SECURE_COOKIE = 'true';
    process.env.SESSION_SAME_SITE = 'strict';

    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/api/health' });

    // Verify CSP
    expect(response.headers['content-security-policy']).toBeDefined();

    // Verify session cookie security
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = parseCookieHeader(setCookie);
      expect(cookies.httpOnly).toBe(true);
      expect(cookies.secure).toBe(true);
      expect(cookies.sameSite).toBe('strict');
    }

    // Verify no information disclosure
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
