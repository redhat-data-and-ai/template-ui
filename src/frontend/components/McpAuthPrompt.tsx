import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { addToast } from '../redux/slices/toasts';
import { type McpAuthRequest } from '../lib/mcp-auth-marker';
import { McpConnectRow, integrationLabel } from './McpConnectRow';
import {
  openMcpOAuthPopup,
  startMcpOAuthConnect,
  verifyMcpOAuthConnected,
} from '../services/mcp-oauth-api';

interface Props {
  requests: McpAuthRequest[];
  /** Called after a successful connect, so the caller can offer a retry. */
  onConnected?: (mcpName: string) => void;
}

/** Inline "Connect <integration>" actions under an assistant message. */
export function McpAuthPrompt({ requests, onConnected }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [alreadyConnected, setAlreadyConnected] = useState<string[]>([]);
  const pollRef = useRef<number | null>(null);

  // Re-check on mount and whenever the tab regains focus.
  //
  // The prompt is pinned to a message, and a message does not
  // change. Connect from the settings page, from another tab, or
  // reload after connecting, and this banner went on insisting the
  // integration was not connected — contradicting the settings page
  // and the next answer, on a turn the user had already fixed. The
  // request list says what was true when the turn ran; whether it is
  // still true is a question only the server can answer.
  // Names we have seen the server call *disconnected* while mounted.
  // A transition out of this set is a connection that just happened,
  // wherever the user made it.
  const seenDisconnected = useRef<Set<string>>(new Set());
  const resumed = useRef<Set<string>>(new Set());

  // Held in a ref so the watcher below does not list it as a
  // dependency: the caller passes an inline arrow, and depending on
  // it would restart the effect — and re-run the checks — on every
  // render of the conversation.
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  const names = requests.map((r) => r.mcpName).join(',');
  useEffect(() => {
    if (names === '') return;
    let cancelled = false;

    const recheck = async () => {
      const checked = await Promise.all(
        names.split(',').map(async (name) => [name, await verifyMcpOAuthConnected(name)] as const),
      );
      if (cancelled) return;

      // Resume from here, not only from the Connect button's popup
      // watcher.
      //
      // The watcher polls until the popup closes, then verifies and
      // calls back. But this re-check also runs on focus — which is
      // exactly when the user returns from the OAuth tab — and
      // hiding the prompt unmounts the component, clearing the
      // interval before it ever fires. The fix that stopped the
      // banner going stale is what stopped the chat resuming.
      //
      // Driving it from the transition covers both: connected here,
      // connected in Settings, connected in another tab.
      for (const [name, ok] of checked) {
        if (!ok) {
          seenDisconnected.current.add(name);
          continue;
        }
        if (!seenDisconnected.current.has(name)) continue;
        if (resumed.current.has(name)) continue;
        resumed.current.add(name);
        onConnectedRef.current?.(name);
      }

      setAlreadyConnected(checked.filter(([, ok]) => ok).map(([name]) => name));
    };

    void recheck();
    const onFocus = () => void recheck();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [names]);

  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const outstanding = requests.filter((r) => !alreadyConnected.includes(r.mcpName));
  if (outstanding.length === 0) return null;

  const connect = async (req: McpAuthRequest) => {
    setBusy(req.mcpName);
    try {
      const { authorize_url } = await startMcpOAuthConnect(req.mcpName);
      const { popup } = openMcpOAuthPopup(authorize_url);
      clearPoll();
      if (!popup) return;
      // Watch the popup rather than trusting it: a user who closes
      // the window without finishing must not leave a button stuck
      // on "Connecting…".
      pollRef.current = window.setInterval(() => {
        if (!popup.closed) return;
        clearPoll();
        void (async () => {
          const ok = await verifyMcpOAuthConnected(req.mcpName);
          // Read after the await, not before. The focus recheck can
          // resume while this request is in flight, and a stale read
          // meant both paths called `onConnected` and the question
          // went twice.
          const alreadyResumed = resumed.current.has(req.mcpName);
          setBusy(null);
          if (!ok) return;
          setDone((d) => [...d, req.mcpName]);
          resumed.current.add(req.mcpName);
          dispatch(
            addToast({
              title: t('mcpAuth.connected', { name: integrationLabel(req.mcpName) }),
              variant: 'success',
            }),
          );
          if (!alreadyResumed) onConnected?.(req.mcpName);
        })();
      }, 500);
    } catch (err) {
      setBusy(null);
      dispatch(
        addToast({
          title: err instanceof Error ? err.message : t('mcpAuth.failed'),
          variant: 'danger',
        }),
      );
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="mcp-auth-prompt">
      {outstanding.map((req) => (
        <McpConnectRow
          key={req.mcpName}
          mcpName={req.mcpName}
          reason={req.reason}
          busy={busy === req.mcpName}
          connected={done.includes(req.mcpName)}
          onConnect={() => void connect(req)}
        />
      ))}
    </div>
  );
}

export default McpAuthPrompt;
