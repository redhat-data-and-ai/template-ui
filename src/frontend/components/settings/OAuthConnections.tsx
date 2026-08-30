import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@patternfly/react-core';
import { KeyRound, Link2, Unplug } from 'lucide-react';
import { useAppDispatch } from '../../redux/hooks';
import { addToast } from '../../redux/slices/toasts';
import {
  disconnectMcpOAuth,
  fetchMcpOAuthConnections,
  openMcpOAuthPopup,
  startMcpOAuthConnect,
  type McpOAuthConnection,
} from '../../services/mcp-oauth-api';

function displayName(connection: McpOAuthConnection): string {
  const description = (connection.description ?? '').trim();
  return description || connection.mcp_name;
}

export function OAuthConnections() {
  const dispatch = useAppDispatch();
  const [connections, setConnections] = useState<McpOAuthConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyMcp, setBusyMcp] = useState<string | null>(null);
  const [oauthOrigin, setOauthOrigin] = useState<string | null>(null);
  const pendingMcpRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);

  const clearPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchMcpOAuthConnections();
      setConnections(rows);
      return rows;
    } catch (err) {
      setConnections(null);
      setError(err instanceof Error ? err.message : 'Failed to load OAuth connections');
      return [];
    }
  }, []);

  const refreshAfterAuth = useCallback(
    async (mcpName: string) => {
      if (refreshingRef.current || pendingMcpRef.current !== mcpName) return;
      refreshingRef.current = true;
      try {
        const rows = await load();
        const nowConnected = rows.some((row) => row.mcp_name === mcpName && row.connected);
        if (nowConnected) {
          pendingMcpRef.current = null;
          clearPoll();
          dispatch(addToast({ title: `${mcpName} connected`, variant: 'success' }));
        }
      } finally {
        refreshingRef.current = false;
      }
    },
    [clearPoll, dispatch, load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; mcp_name?: string } | null;
      if (data?.type !== 'mcp_oauth_done' || !data.mcp_name) return;
      const allowedOrigins = [window.location.origin, oauthOrigin].filter(Boolean);
      if (!allowedOrigins.includes(event.origin)) return;
      void refreshAfterAuth(data.mcp_name);
    };

    const onFocus = () => {
      if (pendingMcpRef.current) {
        void refreshAfterAuth(pendingMcpRef.current);
      }
    };

    window.addEventListener('message', handler);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('message', handler);
      window.removeEventListener('focus', onFocus);
    };
  }, [oauthOrigin, refreshAfterAuth]);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const handleAuthenticate = async (mcpName: string) => {
    setBusyMcp(mcpName);
    setOauthOrigin(null);
    try {
      const { authorize_url } = await startMcpOAuthConnect(mcpName);
      const { origin, popup } = openMcpOAuthPopup(authorize_url);
      pendingMcpRef.current = mcpName;
      setOauthOrigin(origin);
      clearPoll();
      if (popup) {
        pollRef.current = window.setInterval(() => {
          if (!popup.closed) return;
          clearPoll();
          if (pendingMcpRef.current) {
            void refreshAfterAuth(pendingMcpRef.current);
          }
        }, 500);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connect failed';
      setError(message);
      dispatch(addToast({ title: message, variant: 'danger' }));
    } finally {
      setBusyMcp(null);
    }
  };

  const handleDisconnect = async (connection: McpOAuthConnection) => {
    setBusyMcp(connection.mcp_name);
    try {
      await disconnectMcpOAuth(connection.mcp_name);
      dispatch(
        addToast({
          title: `Disconnected ${displayName(connection)}`,
          variant: 'success',
        }),
      );
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Disconnect failed';
      setError(message);
      dispatch(addToast({ title: message, variant: 'danger' }));
    } finally {
      setBusyMcp(null);
    }
  };

  if (connections === null && !error) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner size="sm" aria-label="Loading OAuth connections" />
        Loading OAuth connections…
      </div>
    );
  }

  if (error && connections === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <KeyRound className="w-8 h-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          No OAuth-connected services are configured.
        </p>
        <p className="text-xs text-muted-foreground max-w-xs">
          MCP servers that use OAuth or DCR will appear here so you can connect, re-authenticate,
          or disconnect them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage OAuth connections for MCP servers. Disconnecting clears tokens stored for this
        agent; you can authenticate again at any time.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="space-y-3">
        {connections.map((connection) => {
          const name = displayName(connection);
          const busy = busyMcp === connection.mcp_name;
          return (
            <li
              key={connection.mcp_name}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground break-words">{name}</p>
                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {connection.auth_mode}
                  </span>
                  <span
                    className={
                      connection.connected
                        ? 'inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
                        : 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                    }
                  >
                    {connection.connected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 sm:justify-end">
                {connection.connected ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Link2 className="w-3.5 h-3.5" />}
                      isLoading={busy}
                      aria-label={`Re-authenticate ${name}`}
                      onClick={() => void handleAuthenticate(connection.mcp_name)}
                    >
                      Re-authenticate
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Unplug className="w-3.5 h-3.5" />}
                      isLoading={busy}
                      aria-label={`Disconnect ${name}`}
                      onClick={() => void handleDisconnect(connection)}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Link2 className="w-3.5 h-3.5" />}
                    isLoading={busy}
                    aria-label={`Authenticate ${name}`}
                    onClick={() => void handleAuthenticate(connection.mcp_name)}
                  >
                    Authenticate
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
