import { useTranslation } from 'react-i18next';

/**
 * The one way an unreachable integration is offered to the reader.
 *
 * There were two: an interrupt raised inside a subagent rendered a
 * blue pill button under a sentence about "external tools", while
 * the orchestrator's own failures rendered a small bordered button
 * inside an amber row naming the integration. Same event, two
 * designs, and the reader had no way to know they meant the same
 * thing. Both call this now, so they cannot drift again.
 */
export interface McpConnectRowProps {
  mcpName: string;
  /** `not_connected` or `expired` — different sentences, different fixes. */
  reason?: string;
  busy?: boolean;
  connected?: boolean;
  onConnect: () => void;
}

/** `dataverse` -> `Dataverse`, `unstructured-data` -> `Unstructured data`.
 *
 * The server name is an identifier; dropped straight into a sentence
 * it read as "dataverse is not connected."
 */
export function integrationLabel(name: string): string {
  const spaced = name.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function McpConnectRow({
  mcpName,
  reason,
  busy = false,
  connected = false,
  onConnect,
}: McpConnectRowProps) {
  const { t } = useTranslation();
  const name = integrationLabel(mcpName);

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
      data-testid={`mcp-connect-${mcpName}`}
    >
      <span className="flex-1">
        {reason === 'expired'
          ? t('mcpAuth.expired', { name })
          : t('mcpAuth.notConnected', { name })}
      </span>
      <button
        type="button"
        disabled={busy || connected}
        onClick={onConnect}
        className="rounded border border-amber-500/60 px-2 py-1 font-medium disabled:opacity-60"
      >
        {connected
          ? t('mcpAuth.done')
          : busy
            ? t('mcpAuth.connecting')
            : t('mcpAuth.connect')}
      </button>
    </div>
  );
}

export default McpConnectRow;
