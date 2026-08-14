/**
 * Browser client for MCP Apps host proxy APIs.
 *
 * Calls go UI BFF → template-agent (never directly to MCP servers), so SSO /
 * OAuth tokens stay server-side. Safe for multi-pod: each call is request-scoped.
 */

import { authenticatedFetch } from './authenticated-fetch';
import { buildAgentApiUrl } from '../lib/app-paths';

export interface McpAppsCallToolResult {
  content?: Array<Record<string, unknown>>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpAppsResourceReadResult {
  contents?: Array<{
    uri?: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: { ui?: Record<string, unknown> };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface McpAppsResourceListResult {
  resources?: Array<Record<string, unknown>>;
  nextCursor?: string;
  [key: string]: unknown;
}

export interface McpAppsResourceTemplatesListResult {
  resourceTemplates?: Array<Record<string, unknown>>;
  nextCursor?: string;
  [key: string]: unknown;
}

export interface McpAppsToolsListResult {
  tools?: Array<{
    name?: string;
    inputSchema?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  nextCursor?: string;
  [key: string]: unknown;
}

function mcpAppsPath(mcpName: string, suffix: string): string {
  return `/mcp/${encodeURIComponent(mcpName)}${suffix}`;
}

async function postMcpAppsJson<T>(
  path: string,
  body: Record<string, unknown>,
  errorLabel: string,
): Promise<T> {
  const response = await authenticatedFetch(buildAgentApiUrl(path), {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${errorLabel} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/**
 * Proxy ``resources/list`` via the agent (View → Host → Server).
 */
export async function listMcpAppResources(
  mcpName: string,
  cursor?: string,
): Promise<McpAppsResourceListResult> {
  return postMcpAppsJson(
    mcpAppsPath(mcpName, '/resources/list'),
    cursor !== undefined ? { cursor } : {},
    'resources/list',
  );
}

/**
 * Proxy ``resources/templates/list`` via the agent (View → Host → Server).
 */
export async function listMcpAppResourceTemplates(
  mcpName: string,
  cursor?: string,
): Promise<McpAppsResourceTemplatesListResult> {
  return postMcpAppsJson(
    mcpAppsPath(mcpName, '/resources/templates/list'),
    cursor !== undefined ? { cursor } : {},
    'resources/templates/list',
  );
}

/**
 * Proxy ``resources/read`` for any server resource URI via the agent.
 */
export async function readMcpAppResource(
  mcpName: string,
  uri: string,
): Promise<McpAppsResourceReadResult> {
  if (!uri || typeof uri !== 'string') {
    throw new Error('uri is required');
  }
  return postMcpAppsJson(mcpAppsPath(mcpName, '/resources/read'), { uri }, 'resources/read');
}

/**
 * Proxy ``tools/list`` via the agent (host toolInfo / inputSchema).
 */
export async function listMcpAppTools(
  mcpName: string,
  cursor?: string,
): Promise<McpAppsToolsListResult> {
  return postMcpAppsJson(
    mcpAppsPath(mcpName, '/tools/list'),
    cursor !== undefined ? { cursor } : {},
    'tools/list',
  );
}

/**
 * Proxy app-initiated ``tools/call`` via the agent (visibility enforced server-side).
 */
export async function callMcpAppTool(
  mcpName: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpAppsCallToolResult> {
  return postMcpAppsJson(
    mcpAppsPath(mcpName, '/tools/call'),
    { name, arguments: args },
    'tools/call',
  );
}
