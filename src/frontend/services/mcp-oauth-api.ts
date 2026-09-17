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
  display_name?: string;
  connected: boolean;
}

export interface McpOAuthDisconnectResult {
  mcp_name: string;
  connected: boolean;
}

/** Builds a URL path segment for a specific MCP server's OAuth endpoint. */
function mcpOAuthPath(mcpName: string, suffix: string): string {
  return `/mcp/${encodeURIComponent(mcpName)}${suffix}`;
}

/** Sends an authenticated request to the MCP OAuth BFF and returns the parsed JSON response. */
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

/** Fetches the list of all MCP OAuth/DCR connections for the current user. */
export async function fetchMcpOAuthConnections(): Promise<McpOAuthConnection[]> {
  const body = await mcpOAuthJson<{ connections?: McpOAuthConnection[] }>(
    '/mcp/oauth/connections',
    { method: 'GET' },
    'List MCP OAuth connections',
  );
  if (!Array.isArray(body.connections)) {
    throw new Error('List MCP OAuth connections failed (invalid payload)');
  }
  return body.connections;
}

/** Revokes the OAuth tokens for a specific MCP server connection. */
export async function disconnectMcpOAuth(
  mcpName: string,
): Promise<McpOAuthDisconnectResult> {
  return mcpOAuthJson<McpOAuthDisconnectResult>(
    mcpOAuthPath(mcpName, '/disconnect'),
    { method: 'DELETE' },
    'Disconnect MCP OAuth',
  );
}

/** Initiates the OAuth connect flow and returns the authorization URL to redirect to. */
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

/** Checks whether a specific MCP server has an active OAuth connection. */
export async function verifyMcpOAuthConnected(mcpName: string): Promise<boolean> {
  try {
    const body = await mcpOAuthJson<{ connected?: boolean }>(
      mcpOAuthPath(mcpName, '/status'),
      { method: 'GET' },
      'MCP OAuth status',
    );
    return Boolean(body.connected);
  } catch {
    return false;
  }
}

/** Validates that the authorize URL uses HTTPS or is a localhost HTTP address. */
function isAllowedAuthorizeUrl(url: URL): boolean {
  if (url.protocol === 'https:') {
    return true;
  }
  if (url.protocol !== 'http:') {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Opens a popup window for the OAuth authorization flow and returns its origin and handle. */
export function openMcpOAuthPopup(authorizeUrl: string): { origin: string; popup: Window } {
  const url = new URL(authorizeUrl, window.location.origin);
  if (!isAllowedAuthorizeUrl(url)) {
    throw new Error('Invalid authorization URL');
  }
  const popup = window.open(url.href, 'mcp-oauth', 'width=600,height=700');
  if (!popup) {
    throw new Error('Popup blocked by browser');
  }
  return { origin: url.origin, popup };
}
