import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestServer } from './test-utils.js';
import { getSettings, resetSettings } from '../utils/settings.js';

/**
 * Who a rate limit applies to.
 *
 * Raising `max` was the easy half. The harder half is that the limit
 * was keyed on `request.ip` with no proxy trust, so behind an
 * OpenShift Route every request carried the ingress pod's address and
 * the entire deployment shared a single bucket. That is not a
 * per-user limit at any number — it just fails later with more users,
 * which is the opposite of what you want.
 */

beforeEach(() => {
  process.env.AUTH_ENABLED = 'false';
  resetSettings();
});

afterEach(() => {
  delete process.env.AUTH_ENABLED;
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.SECURITY_RATE_LIMIT_TRUST_PROXY;
  resetSettings();
});

describe('rate limit scope', () => {
  it('ships a limit a chat UI will not trip during normal use', () => {
    // One load of the analytics page is four calls; streaming,
    // thread-state polling and uploads stack on top. A limit that
    // fires on ordinary work teaches people to ignore the error.
    expect(getSettings().security.rate_limit.max).toBeGreaterThanOrEqual(500);
  });

  it('trusts exactly one proxy hop by default', () => {
    // Not `true`. Trusting the whole X-Forwarded-For chain lets a
    // caller prepend any address and mint a fresh bucket per request,
    // which removes the limit entirely for anyone who reads this file.
    expect(getSettings().security.rate_limit.trust_proxy).toBe(1);
  });

  it('can be told to trust nothing', () => {
    // For a deployment with no proxy in front, where honouring
    // X-Forwarded-For would be a spoofing hole rather than a fix.
    process.env.SECURITY_RATE_LIMIT_TRUST_PROXY = '0';
    resetSettings();
    expect(getSettings().security.rate_limit.trust_proxy).toBe(false);
  });

  it('reads the client address from the forwarded header', async () => {
    process.env.RATE_LIMIT_MAX = '3';
    resetSettings();
    const server = await buildTestServer();

    // Two "clients" arriving through the same proxy socket. With no
    // proxy trust these share a bucket and the second one is throttled
    // by the first one's traffic.
    const send = (forwardedFor: string) =>
      server.inject({
        method: 'GET',
        url: '/api/config/branding',
        headers: { 'x-forwarded-for': forwardedFor },
      });

    for (let i = 0; i < 4; i += 1) await send('203.0.113.10');
    const other = await send('203.0.113.99');

    expect(other.statusCode).not.toBe(429);
    await server.close();
  });

  it('still throttles a single client past the limit', async () => {
    // The guard against the previous test's fix: separating clients
    // must not mean nobody is limited.
    process.env.RATE_LIMIT_MAX = '3';
    resetSettings();
    const server = await buildTestServer();

    const results = [];
    for (let i = 0; i < 6; i += 1) {
      results.push(
        await server.inject({
          method: 'GET',
          url: '/api/config/branding',
          headers: { 'x-forwarded-for': '198.51.100.7' },
        }),
      );
    }

    expect(results.filter((r) => r.statusCode === 429).length).toBeGreaterThan(0);
    await server.close();
  });
});
