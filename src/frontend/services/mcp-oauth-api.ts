/**
 * Browser client for per-user MCP OAuth/DCR connect, status, and disconnect.
 *
 * Calls go UI BFF → template-agent. Tokens stay server-side.
 */

import { authenticatedFetch } from './authenticated-fetch';
import { buildAgentApiUrl } from '../lib/app-paths';

export interface McpOAuthConnection {
  mcp_name: string;
  auth_mode: string;
  description: string;
  connected: boolean;
}

export interface McpOAuthDisconnectResult {
  mcp_name: string;
  connected: boolean;
}

const STATUS_RETRY_MS = 400;
const STATUS_MAX_RETRIES = 6;

function mcpOAuthPath(mcpName: string, suffix: string): string {
  return `/mcp/${encodeURIComponent(mcpName)}${suffix}`;
}

async function mcpOAuthJson<T>(
  path: string,
  init: RequestInit,
  errorLabel: string,
): Promise<T> {
  const response = await authenticatedFetch(buildAgentApiUrl(path), init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${errorLabel} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchMcpOAuthConnections(): Promise<McpOAuthConnection[]> {
  const body = await mcpOAuthJson<{ connections?: McpOAuthConnection[] }>(
    '/mcp/oauth/connections',
    { method: 'GET' },
    'List MCP OAuth connections',
  );
  return Array.isArray(body.connections) ? body.connections : [];
}

export async function disconnectMcpOAuth(
  mcpName: string,
): Promise<McpOAuthDisconnectResult> {
  return mcpOAuthJson<McpOAuthDisconnectResult>(
    mcpOAuthPath(mcpName, '/disconnect'),
    { method: 'DELETE' },
    'Disconnect MCP OAuth',
  );
}

export async function startMcpOAuthConnect(
  mcpName: string,
): Promise<{ authorize_url: string }> {
  const body = await mcpOAuthJson<{ authorize_url?: string }>(
    mcpOAuthPath(mcpName, '/connect'),
    { method: 'POST' },
    'Connect',
  );
  if (!body.authorize_url) {
    throw new Error('No authorize_url returned');
  }
  return { authorize_url: body.authorize_url };
}

export async function verifyMcpOAuthConnected(mcpName: string): Promise<boolean> {
  for (let attempt = 0; attempt < STATUS_MAX_RETRIES; attempt++) {
    try {
      const body = await mcpOAuthJson<{ connected?: boolean }>(
        mcpOAuthPath(mcpName, '/status'),
        { method: 'GET' },
        'MCP OAuth status',
      );
      if (body.connected) return true;
    } catch (err) {
      if (err instanceof Error && /rate limited/i.test(err.message)) {
        return false;
      }
    }
    if (attempt < STATUS_MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, STATUS_RETRY_MS));
    }
  }
  return false;
}

export function openMcpOAuthPopup(authorizeUrl: string): { origin: string; popup: Window } {
  const url = new URL(authorizeUrl, window.location.origin);
  const popup = window.open(url.href, 'mcp-oauth', 'width=600,height=700');
  if (!popup) {
    throw new Error('Popup blocked by browser');
  }
  return { origin: url.origin, popup };
}
