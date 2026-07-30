import type { FastifyInstance } from 'fastify';
import { setupServer } from '../server.js';
import type { UISettings } from '../utils/settings.js';

export async function buildTestServer(
  overrides?: Partial<UISettings>
): Promise<FastifyInstance> {
  // Disable auth plugin by default — OAuth env vars are not available in CI/test
  // and security tests don't exercise OAuth flows
  if (!process.env.FEATURE_AUTH_ENABLED) {
    process.env.FEATURE_AUTH_ENABLED = 'false';
  }

  // Provide a valid COOKIE_SIGN for tests unless the test itself is intentionally
  // testing the missing/short secret guard (those tests set their own value).
  if (!process.env.COOKIE_SIGN) {
    process.env.COOKIE_SIGN = 'test-secret-value-that-is-32chars!!';
  }

  // Apply test config via environment variables
  if (overrides?.security?.session) {
    if (overrides.security.session.http_only !== undefined) {
      process.env.SESSION_HTTP_ONLY = String(overrides.security.session.http_only);
    }
    if (overrides.security.session.same_site) {
      process.env.SESSION_SAME_SITE = overrides.security.session.same_site;
    }
  }

  return await setupServer();
}

export interface CookieAttributes {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  path?: string;
}

export function parseCookieHeader(setCookieHeader: string | string[]): CookieAttributes {
  const cookieStr = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;

  const attrs: CookieAttributes = {};
  const parts = cookieStr.split(';').map(p => p.trim());

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'httponly') attrs.httpOnly = true;
    if (lower === 'secure') attrs.secure = true;
    if (lower.startsWith('samesite=')) {
      attrs.sameSite = part.split('=')[1].toLowerCase() as any;
    }
    if (lower.startsWith('max-age=')) {
      attrs.maxAge = parseInt(part.split('=')[1]);
    }
    if (lower.startsWith('path=')) {
      attrs.path = part.split('=')[1];
    }
  }

  return attrs;
}

export function assertCspDirective(
  cspHeader: string,
  directive: string,
  expectedValues: string[]
) {
  const directives = cspHeader.split(';').map(d => d.trim());
  const target = directives.find(d => d.startsWith(directive));

  if (!target) {
    throw new Error(`CSP directive '${directive}' not found in header: ${cspHeader}`);
  }

  for (const value of expectedValues) {
    if (!target.includes(value)) {
      throw new Error(`CSP directive '${directive}' missing value '${value}'. Found: ${target}`);
    }
  }
}

export async function bombardEndpoint(
  server: FastifyInstance,
  path: string,
  count: number,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
  payload?: any
): Promise<Array<{ statusCode: number; headers: Record<string, any> }>> {
  const promises = Array.from({ length: count }, () =>
    server.inject({
      method,
      url: path,
      ...(payload ? { payload } : {})
    })
  );

  return await Promise.all(promises);
}

export function generatePathTraversalPayloads(): string[] {
  return [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '/etc/shadow',
    'config/../../secrets.yaml',
    './config/../../../.env',
    '....//....//....//etc/passwd',
    'config/ui/../../.env'
  ];
}
