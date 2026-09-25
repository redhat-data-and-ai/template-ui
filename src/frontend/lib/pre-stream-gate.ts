import type { McpOAuthConnection } from '../services/mcp-oauth-api';

export function unauthenticatedMcpConnections(
  connections: McpOAuthConnection[],
): McpOAuthConnection[] {
  return connections.filter((connection) => !connection.connected);
}

export function isPreStreamReady(
  autoApproveAllTools: boolean,
  connections: McpOAuthConnection[],
): boolean {
  return autoApproveAllTools && unauthenticatedMcpConnections(connections).length === 0;
}
