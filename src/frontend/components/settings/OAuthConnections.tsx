import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  EmptyStateBody,
  Label,
  Spinner,
} from '@patternfly/react-core';
import { KeyIcon, LinkIcon, SyncAltIcon, UnlinkIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { addToast } from '../../redux/slices/toasts';
import { selectDeveloperMode } from '../../redux/slices/userSettings';
import { isPrivilegedUser } from '../../lib/role-utils';
import type { RootState } from '../../redux/store';
import {
  disconnectMcpOAuth,
  fetchMcpOAuthConnections,
  openMcpOAuthPopup,
  reregisterMcpOAuth,
  startMcpOAuthConnect,
  type McpOAuthConnection,
} from '../../services/mcp-oauth-api';

/** Returns a human-readable label for the connection, preferring display_name, then mcp_name, then description. */
function displayName(connection: McpOAuthConnection): string {
  const dn = (connection.display_name ?? '').trim();
  return dn || connection.mcp_name || (connection.description ?? '').trim();
}

/** Settings panel for managing OAuth/DCR connections to MCP servers. */
export function OAuthConnections() {
  const dispatch = useAppDispatch();
  const developerMode = useAppSelector(selectDeveloperMode);
  const mcpDcrEnabled = useAppSelector((state: RootState) => state.config.features?.mcp_dcr_enabled ?? false);
  const showReregister = isPrivilegedUser() && developerMode && mcpDcrEnabled;
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

  const handleReregister = async (connection: McpOAuthConnection) => {
    setBusyMcp(connection.mcp_name);
    try {
      await reregisterMcpOAuth(connection.mcp_name);
      dispatch(
        addToast({
          title: `Re-registered ${displayName(connection)}`,
          variant: 'success',
        }),
      );
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Re-register failed';
      setError(message);
      dispatch(addToast({ title: message, variant: 'danger' }));
    } finally {
      setBusyMcp(null);
    }
  };

  if (connections === null && !error) {
    return (
      <div role="status" className="app-settings__row" style={{ justifyContent: 'flex-start' }}>
        <Spinner size="md" aria-label="Loading OAuth connections" />
        Loading OAuth connections…
      </div>
    );
  }

  if (error && connections === null) {
    return (
      <div className="app-settings__stack">
        <Alert component="h3" isInline variant="danger" title={error} />
        <div>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return (
      <EmptyState
        headingLevel="h3"
        titleText="No OAuth-connected services are configured."
        icon={KeyIcon}
        variant="sm"
      >
        <EmptyStateBody>
          MCP servers that use OAuth or DCR will appear here so you can connect, re-authenticate, or
          disconnect them.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <div className="app-settings__stack">
      <p className="app-settings__muted">
        Manage OAuth connections for MCP servers. Disconnecting clears tokens stored for this agent;
        you can authenticate again at any time.
      </p>
      {error && <Alert component="h3" isInline variant="danger" title={error} />}
      <ul className="app-settings__list">
        {connections.map((connection) => {
          const name = displayName(connection);
          const busy = busyMcp === connection.mcp_name;
          const reregister = showReregister && connection.auth_mode === 'dcr' && (
            <Button
              variant="secondary"
              icon={<SyncAltIcon />}
              isLoading={busy}
              aria-label={`Re-register ${name}`}
              onClick={() => void handleReregister(connection)}
            >
              Re-register
            </Button>
          );
          return (
            <li key={connection.mcp_name}>
              <Card isCompact style={{ width: '100%' }}>
                <CardBody>
                  <div className="app-settings__row" style={{ flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ overflowWrap: 'anywhere' }}>{name}</p>
                      <div className="app-settings__row" style={{ justifyContent: 'flex-start', marginBlockStart: 'var(--pf-t--global--spacer--xs)' }}>
                        <Label isCompact variant="outline">
                          {connection.auth_mode}
                        </Label>
                        <Label isCompact color={connection.connected ? 'green' : undefined}>
                          {connection.connected ? 'Connected' : 'Not connected'}
                        </Label>
                      </div>
                    </div>
                    <div className="app-settings__row" style={{ flexWrap: 'wrap' }}>
                      {reregister}
                      {connection.connected ? (
                        <>
                          <Button
                            variant="secondary"
                            icon={<LinkIcon />}
                            isLoading={busy}
                            aria-label={`Re-authenticate ${name}`}
                            onClick={() => void handleAuthenticate(connection.mcp_name)}
                          >
                            Re-authenticate
                          </Button>
                          <Button
                            variant="danger"
                            icon={<UnlinkIcon />}
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
                          icon={<LinkIcon />}
                          isLoading={busy}
                          aria-label={`Authenticate ${name}`}
                          onClick={() => void handleAuthenticate(connection.mcp_name)}
                        >
                          Authenticate
                        </Button>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
