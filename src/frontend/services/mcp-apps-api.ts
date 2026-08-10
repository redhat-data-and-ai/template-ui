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

function mcpAppsPath(mcpName: string, suffix: string): string {
  return `/mcp/${encodeURIComponent(mcpName)}${suffix}`;
}

/**
 * Proxy ``resources/list`` via the agent (View → Host → Server).
 */
export async function listMcpAppResources(
  mcpName: string,
  cursor?: string,
): Promise<McpAppsResourceListResult> {
  const response = await authenticatedFetch(
    buildAgentApiUrl(mcpAppsPath(mcpName, '/resources/list')),
    {
      method: 'POST',
      body: JSON.stringify(cursor !== undefined ? { cursor } : {}),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `resources/list failed (${response.status})`);
  }
  return (await response.json()) as McpAppsResourceListResult;
}

/**
 * Proxy ``resources/templates/list`` via the agent (View → Host → Server).
 */
export async function listMcpAppResourceTemplates(
  mcpName: string,
  cursor?: string,
): Promise<McpAppsResourceTemplatesListResult> {
  const response = await authenticatedFetch(
    buildAgentApiUrl(mcpAppsPath(mcpName, '/resources/templates/list')),
    {
      method: 'POST',
      body: JSON.stringify(cursor !== undefined ? { cursor } : {}),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `resources/templates/list failed (${response.status})`);
  }
  return (await response.json()) as McpAppsResourceTemplatesListResult;
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
  const response = await authenticatedFetch(
    buildAgentApiUrl(mcpAppsPath(mcpName, '/resources/read')),
    {
      method: 'POST',
      body: JSON.stringify({ uri }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `resources/read failed (${response.status})`);
  }
  return (await response.json()) as McpAppsResourceReadResult;
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

/**
 * Proxy ``tools/list`` via the agent (host toolInfo / inputSchema).
 */
export async function listMcpAppTools(
  mcpName: string,
  cursor?: string,
): Promise<McpAppsToolsListResult> {
  const response = await authenticatedFetch(
    buildAgentApiUrl(mcpAppsPath(mcpName, '/tools/list')),
    {
      method: 'POST',
      body: JSON.stringify(cursor !== undefined ? { cursor } : {}),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `tools/list failed (${response.status})`);
  }
  return (await response.json()) as McpAppsToolsListResult;
}

/**
 * Proxy app-initiated ``tools/call`` via the agent (visibility enforced server-side).
 */
export async function callMcpAppTool(
  mcpName: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpAppsCallToolResult> {
  const response = await authenticatedFetch(
    buildAgentApiUrl(mcpAppsPath(mcpName, '/tools/call')),
    {
      method: 'POST',
      body: JSON.stringify({ name, arguments: args }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `tools/call failed (${response.status})`);
  }
  return (await response.json()) as McpAppsCallToolResult;
}
