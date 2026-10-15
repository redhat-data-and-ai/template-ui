import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  Spinner,
  Tab,
  TabTitleText,
  Tabs,
  Tooltip,
} from '@patternfly/react-core';
import { Plug, RefreshCw, Server, Unplug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '../../redux/hooks';
import { addToast } from '../../redux/slices/toasts';
import { buildAgentApiUrl } from '../../lib/app-paths';
import {
  disconnectMcpOAuth,
  fetchMcpOAuthConnections,
  openMcpOAuthPopup,
  reregisterMcpOAuth,
  startMcpOAuthConnect,
} from '../../services/mcp-oauth-api';

interface McpServer {
  name: string;
  url: string;
  transport: string;
  enabled: boolean;
  auth_mode: string;
  tool_prefix: string;
  display_name?: string;
  description?: string;
  has_icon?: boolean;
}

/** Modes where "connect" means something: a per-user token to obtain. */
const CONNECTABLE = new Set(['oauth', 'dcr']);

interface InventoryItem {
  name: string;
  description: string;
  /** Present on resources whose name is not already the URI. */
  uri?: string;
  /** The server's own `readOnlyHint`. Absent means the server did
      not say, which is different from saying it writes. */
  read_only?: boolean;
  destructive?: boolean;
}

interface Inventory {
  tools: InventoryItem[];
  resources: InventoryItem[];
  prompts: InventoryItem[];
}

/**
 * Every MCP server in the agent's config, with its connection state.
 *
 * The OAuth panel only knows about servers that already have a
 * connection record, so a configured server that nobody has connected
 * to appears nowhere — indistinguishable from one that was never
 * added.
 */
export function McpServerList() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canReregister, setCanReregister] = useState(false);
  const pending = useRef<string | null>(null);
  const poll = useRef<number | null>(null);
  const popupOrigin = useRef<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const openServerLabel =
    (servers ?? []).find((s) => s.name === open)?.display_name ?? open ?? '';
  const [inventory, setInventory] = useState<Record<string, Inventory>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch(buildAgentApiUrl('/mcp/servers'));
      if (!response.ok) throw new Error(`Could not load MCP servers (${response.status})`);
      const body = await response.json();
      setServers(Array.isArray(body?.servers) ? body.servers : []);
      setCanReregister(Boolean(body?.reregister_enabled));

      // Connection state is a separate call and a separate failure:
      // not being able to read it should grey the buttons, not hide
      // the servers.
      try {
        const connections = await fetchMcpOAuthConnections();
        setConnected(
          new Set(connections.filter((c) => c.connected).map((c) => c.mcp_name)),
        );

      } catch {
        setConnected(new Set());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load MCP servers');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clearPoll = useCallback(() => {
    if (poll.current) {
      window.clearInterval(poll.current);
      poll.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  // Three ways to learn a connection finished, because one is not
  // enough:
  //
  //  - the popup posts `mcp_oauth_done` when the callback page runs;
  //  - returning to this window (focus) covers a popup that was
  //    blocked, or a flow the user completed in a normal tab;
  //  - the `popup.closed` poll in handleConnect covers a popup closed
  //    without the message arriving.
  //
  // The first replacement for the old panel had only the third, which
  // is why a connection made any other way left the row reading
  // "Connect" until a manual reload.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type !== 'mcp_oauth_done') return;
      // The callback page is served by the agent, not by this app, so
      // its origin is not necessarily ours. Accept this window's
      // origin or the one the popup was opened on, and nothing else —
      // the message only triggers a reload, but an unchecked origin
      // is still an open door.
      const allowed = [window.location.origin, popupOrigin.current].filter(Boolean);
      if (!allowed.includes(event.origin)) return;
      void load();
    };
    const onFocus = () => void load();

    window.addEventListener('message', onMessage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const handleConnect = async (name: string) => {
    setBusy(name);
    try {
      const { authorize_url } = await startMcpOAuthConnect(name);
      const { origin, popup } = openMcpOAuthPopup(authorize_url);
      popupOrigin.current = origin;
      pending.current = name;
      clearPoll();
      if (popup) {
        // The popup may be closed without finishing, so the list is
        // reloaded on close rather than assumed successful.
        poll.current = window.setInterval(() => {
          if (!popup.closed) return;
          clearPoll();
          void load();
        }, 500);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connect failed';
      dispatch(addToast({ title: message, variant: 'danger' }));
    } finally {
      setBusy(null);
    }
  };

  const openServer = async (name: string) => {
    setOpen(name);
    setActiveTab(0);
    if (inventory[name]) return;
    try {
      const r = await fetch(
        buildAgentApiUrl(`/mcp/${encodeURIComponent(name)}/inventory`),
      );
      if (!r.ok) return;
      const body = await r.json();
      setInventory((prev) => ({
        ...prev,
        [name]: {
          tools: Array.isArray(body?.tools) ? body.tools : [],
          resources: Array.isArray(body?.resources) ? body.resources : [],
          prompts: Array.isArray(body?.prompts) ? body.prompts : [],
        },
      }));
    } catch {
      /* a server that will not answer shows an empty panel */
    }
  };

  const handleReregister = async (name: string) => {
    // The client a provider issued is a snapshot of what we asked
    // for. Change the redirect URI, or start requesting scopes we
    // were not requesting before, and the stored client is stale —
    // the symptom is an opaque 400 at the token exchange, which
    // reads as "auth is broken" rather than "the registration is
    // out of date".
    setBusy(name);
    try {
      await reregisterMcpOAuth(name);
      dispatch(addToast({ title: `Re-registered ${name}`, variant: 'success' }));
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Re-register failed';
      dispatch(addToast({ title: message, variant: 'danger' }));
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async (name: string) => {
    setBusy(name);
    try {
      await disconnectMcpOAuth(name);
      dispatch(addToast({ title: `Disconnected ${name}`, variant: 'success' }));
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Disconnect failed';
      dispatch(addToast({ title: message, variant: 'danger' }));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!servers) return <Spinner size="md" aria-label="Loading MCP servers" />;
  if (servers.length === 0) {
    return <p className="text-sm text-muted-foreground">No MCP servers are configured.</p>;
  }

  return (
    <>
      <ul className="list-none p-0 space-y-2">
      {servers.map((server) => {
        const isConnected = connected.has(server.name);
        // The key addresses the server; this is what a person reads.
        const label = server.display_name ?? server.name;
        const connectable = server.enabled && CONNECTABLE.has(server.auth_mode);

        // Why a button is unavailable, in a tooltip rather than a
        // paragraph above the list.
        const statusLabel = !server.enabled
          ? 'Disabled in the agent configuration'
          : isConnected
            ? 'Connected'
            : `Not connected (${server.auth_mode})`;

        const reason = !server.enabled
          ? 'Disabled in the agent configuration'
          : CONNECTABLE.has(server.auth_mode)
            ? undefined
            : 'Uses your signed-in session — nothing to connect';

        return (
          <li
            key={server.name}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5"
          >
            {/* The dot is the state. A word beside it repeated the
                same fact in more space, on every one of thirteen
                rows — so the word became a tooltip, which is where
                the longer explanation belongs anyway. */}
            <Tooltip content={statusLabel}>
              <span
                role="img"
                aria-label={statusLabel}
                className={`h-2 w-2 shrink-0 rounded-full ${
                  !server.enabled
                    ? 'bg-muted-foreground/40'
                    : isConnected
                      ? 'bg-green-500'
                      : 'bg-amber-500'
                }`}
              />
            </Tooltip>
            {/* Icon, name, description. The URL is gone — it is long
                enough to push the controls off the row and answers a
                question nobody asks of a list. What the server
                *offers* is the useful detail, and that is a click
                away. */}
            <button
              type="button"
              onClick={() => void openServer(server.name)}
              disabled={!isConnected}
              className="min-w-0 flex-1 flex items-center gap-2.5 text-left bg-transparent border-0 p-0 disabled:cursor-default"
            >
              {/* Served from our own origin by the agent, not linked
                  to the vendor. The CSP allows images from `self`
                  only, and widening it to `https:` to show a favicon
                  would trade a real control for decoration. */}
              {server.has_icon ? (
                <img
                  src={buildAgentApiUrl(
                    `/mcp/${encodeURIComponent(server.name)}/icon`,
                  )}
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0 rounded-sm"
                  // An icon that fails leaves a gap, not a broken
                  // image glyph.
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
              ) : (
                <Server className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {label}
                </span>
                {server.description && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {server.description}
                  </span>
                )}
              </span>
            </button>

            {/* Icons, not words. Three text buttons per row across
                thirteen rows is a wall of verbs; the state is already
                carried by the dot and the label beside it. The words
                move into aria-label and the tooltip, so the meaning
                survives for a screen reader and on hover. */}
            {isConnected ? (
              <Tooltip content={`Disconnect ${label}`}>
                <Button
                  variant="plain"
                  size="sm"
                  isDisabled={busy === server.name}
                  isLoading={busy === server.name}
                  onClick={() => void handleDisconnect(server.name)}
                  aria-label={`Disconnect ${label}`}
                >
                  <Unplug className="w-4 h-4" aria-hidden="true" />
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content={reason ?? `Connect ${label}`}>
                {/* Wrapped in a span so the tooltip still fires on a
                    disabled button, which does not emit pointer
                    events — the reason it is disabled is exactly what
                    the reader needs. */}
                <span className="inline-flex">
                  <Button
                    variant="plain"
                    size="sm"
                    isDisabled={!connectable || busy === server.name}
                    isLoading={busy === server.name}
                    onClick={() => void handleConnect(server.name)}
                    aria-label={`Connect ${label}`}
                  >
                    <Plug className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </span>
              </Tooltip>
            )}

            {/* Icon, not a word: this is a rare repair action sitting
                beside the control people actually use, and a second
                text button competes with it for attention. The label
                lives in aria-label and the tooltip. */}
            {canReregister && connectable && (
              <Tooltip content="Discard the stored client and register a new one">
                <Button
                  variant="plain"
                  size="sm"
                  isDisabled={busy === server.name}
                  onClick={() => void handleReregister(server.name)}
                  aria-label={`Re-register ${label}`}
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                </Button>
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>

      {/* One modal for the whole list rather than one per row:
          thirteen mounted dialogs is thirteen focus traps waiting to
          misbehave, and only one can ever be open. */}
      <Modal
        variant={ModalVariant.medium}
        isOpen={open !== null}
        onClose={() => setOpen(null)}
        aria-label={open ? `${open} capabilities` : 'Server capabilities'}
      >
        <ModalHeader title={openServerLabel} />
        <ModalBody>
          {open && !inventory[open] ? (
            <Spinner size="lg" aria-label={`Loading ${open}`} />
          ) : (
            open && (
              <Tabs
                activeKey={activeTab}
                onSelect={(_e, key) => setActiveTab(Number(key))}
                aria-label={`${open} capabilities`}
              >
                {(['tools', 'prompts', 'resources'] as const).map((kind, index) => {
                  const items = inventory[open][kind];
                  return (
                    <Tab
                      key={kind}
                      eventKey={index}
                      // The count belongs on the tab, where it says
                      // what is behind it, rather than on the row,
                      // where it cost a whole extra session per
                      // server on every page load.
                      title={
                        <TabTitleText>
                          {kind[0].toUpperCase() + kind.slice(1)} ({items.length})
                        </TabTitleText>
                      }
                    >
                      {items.length === 0 ? (
                        <p className="py-4 text-sm text-muted-foreground">
                          This server exposes no {kind}.
                        </p>
                      ) : (
                        <ul className="list-none p-0 py-2 space-y-3">
                          {items.map((item, i) => (
                            // Index in the key because names are not
                            // guaranteed unique — Atlan returned six
                            // resources all called `_resource`, which
                            // React treats as one row repeated.
                            <li key={`${item.name}:${i}`}>
                              <span className="flex items-baseline gap-2">
                                <code className="text-sm text-foreground">
                                  {item.name}
                                </code>
                                {/* Only shown when the server said
                                    so. No badge means unknown, not
                                    safe — inventing a default here
                                    would be a guess rendered as a
                                    fact about what a tool can do. */}
                                {item.read_only === true && (
                                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ring-1 ring-border">
                                    {t('mcp.readOnly')}
                                  </span>
                                )}
                                {item.destructive === true && (
                                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive ring-1 ring-destructive/40">
                                    {t('mcp.destructive')}
                                  </span>
                                )}
                              </span>
                              {item.uri && (
                                <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground/80">
                                  {item.uri}
                                </span>
                              )}
                              {item.description && (
                                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                                  {item.description}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Tab>
                  );
                })}
              </Tabs>
            )
          )}
        </ModalBody>
      </Modal>
    </>
  );
}
