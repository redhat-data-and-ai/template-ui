import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@patternfly/react-core';
import { Link2 } from 'lucide-react';
import { buildAgentApiUrl } from '../lib/app-paths';

interface McpOAuthPrecheckProps {
  readonly onConnected: () => void;
}

const OAUTH_STATUS_RETRY_MS = 400;
const OAUTH_STATUS_MAX_RETRIES = 6;

async function fetchDisconnectedMcps(): Promise<string[]> {
  const infoResp = await fetch(buildAgentApiUrl('/info'), { credentials: 'include' });
  if (!infoResp.ok) return [];

  const info = (await infoResp.json()) as { oauth_mcps?: string[] };
  const oauthMcps = info.oauth_mcps ?? [];
  if (oauthMcps.length === 0) return [];

  const pending: string[] = [];
  await Promise.all(
    oauthMcps.map(async (name) => {
      const statusResp = await fetch(
        buildAgentApiUrl(`/mcp/${encodeURIComponent(name)}/status`),
        { credentials: 'include' },
      );
      if (!statusResp.ok) {
        pending.push(name);
        return;
      }
      const body = (await statusResp.json()) as { connected?: boolean };
      if (!body.connected) {
        pending.push(name);
      }
    }),
  );
  return pending;
}

export function McpOAuthPrecheck({ onConnected }: McpOAuthPrecheckProps) {
  const [disconnected, setDisconnected] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hadPendingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const pending = await fetchDisconnectedMcps();
      setDisconnected(pending);
    } catch {
      // non-fatal — precheck is best-effort
    }
  }, []);

  /** Re-fetch until *mcpName* reports connected (token may lag after callback). */
  const refreshAfterOAuth = useCallback(async (mcpName: string) => {
    for (let attempt = 0; attempt < OAUTH_STATUS_MAX_RETRIES; attempt++) {
      try {
        const pending = await fetchDisconnectedMcps();
        setDisconnected(pending);
        if (!pending.includes(mcpName)) {
          return;
        }
      } catch {
        // retry
      }
      if (attempt < OAUTH_STATUS_MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, OAUTH_STATUS_RETRY_MS));
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onOAuthDone = (event: MessageEvent) => {
      const data = event.data as { type?: string; mcp_name?: string } | null;
      if (data?.type !== 'mcp_oauth_done' || !data.mcp_name) return;
      setError(null);
      // Optimistic: drop this MCP from the list immediately.
      setDisconnected((prev) => prev.filter((name) => name !== data.mcp_name));
      void refreshAfterOAuth(data.mcp_name);
    };

    const onFocus = () => {
      void refresh();
    };

    window.addEventListener('message', onOAuthDone);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('message', onOAuthDone);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, refreshAfterOAuth]);

  // Notify parent once when all required MCPs are connected.
  useEffect(() => {
    if (disconnected.length > 0) {
      hadPendingRef.current = true;
      return;
    }
    if (hadPendingRef.current) {
      hadPendingRef.current = false;
      onConnected();
    }
  }, [disconnected.length, onConnected]);

  const handleConnect = useCallback(async (mcpName: string) => {
    setConnecting(mcpName);
    setError(null);
    try {
      const resp = await fetch(
        buildAgentApiUrl(`/mcp/${encodeURIComponent(mcpName)}/connect`),
        { method: 'POST', credentials: 'include' },
      );
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const body = (await resp.json()) as { authorize_url?: string };
      if (!body.authorize_url) {
        throw new Error('No authorize_url returned');
      }
      window.open(body.authorize_url, 'mcp-oauth', 'width=600,height=700');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnecting(null);
    }
  }, []);

  if (disconnected.length === 0) {
    return null;
  }

  return (
    <div className="mx-4 mb-3" role="alert">
      <Alert variant="warning" title="MCP connections required" isInline>
        <p className="text-sm mb-2">
          Connect to the following MCP servers before using their tools:
        </p>
        <ul className="text-sm mb-3 list-disc pl-5">
          {disconnected.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {disconnected.map((name) => (
            <Button
              key={name}
              variant="primary"
              size="sm"
              icon={<Link2 className="w-3.5 h-3.5" />}
              isLoading={connecting === name}
              onClick={() => void handleConnect(name)}
            >
              Connect {name}
            </Button>
          ))}
        </div>
      </Alert>
    </div>
  );
}
