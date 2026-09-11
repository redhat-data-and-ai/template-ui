import { describe, expect, it } from 'vitest';
import type { McpOAuthConnection } from '../services/mcp-oauth-api';
import { isPreStreamReady, unauthenticatedMcpConnections } from './pre-stream-gate';

const connected: McpOAuthConnection = {
  mcp_name: 'docs-mcp',
  auth_mode: 'dcr',
  description: 'Docs',
  connected: true,
};

const disconnected: McpOAuthConnection = {
  mcp_name: 'jira-mcp',
  auth_mode: 'dcr',
  description: 'Jira',
  connected: false,
};

describe('isPreStreamReady', () => {
  it('is true when auto-approve is on and there are no MCP connections', () => {
    expect(isPreStreamReady(true, [])).toBe(true);
  });

  it('is true when auto-approve is on and every MCP is connected', () => {
    expect(isPreStreamReady(true, [connected])).toBe(true);
  });

  it('is false when auto-approve is off', () => {
    expect(isPreStreamReady(false, [])).toBe(false);
    expect(isPreStreamReady(false, [connected])).toBe(false);
  });

  it('is false when any MCP is disconnected', () => {
    expect(isPreStreamReady(true, [connected, disconnected])).toBe(false);
  });
});

describe('unauthenticatedMcpConnections', () => {
  it('returns only disconnected servers', () => {
    expect(unauthenticatedMcpConnections([connected, disconnected])).toEqual([disconnected]);
  });
});
