import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PreStreamGateModal } from '../components/PreStreamGateModal';
import { isPreStreamReady, unauthenticatedMcpConnections } from '../lib/pre-stream-gate';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { addToast } from '../redux/slices/toasts';
import { selectAutoApproveAllTools, setAutoApproveAllTools } from '../redux/slices/userSettings';
import {
  fetchMcpOAuthConnections,
  openMcpOAuthPopup,
  startMcpOAuthConnect,
  type McpOAuthConnection,
} from '../services/mcp-oauth-api';

export function usePreStreamGate(): {
  ensureReady: () => Promise<boolean>;
  modal: ReactNode;
} {
  const dispatch = useAppDispatch();
  const autoApproveAllTools = useAppSelector(selectAutoApproveAllTools);
  const autoApproveRef = useRef(autoApproveAllTools);
  autoApproveRef.current = autoApproveAllTools;

  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<McpOAuthConnection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyMcp, setBusyMcp] = useState<string | null>(null);
  const [oauthOrigin, setOauthOrigin] = useState<string | null>(null);

  const pendingRef = useRef<{ resolve: (ready: boolean) => void } | null>(null);
  const inflightRef = useRef<Promise<boolean> | null>(null);
  const pendingMcpRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);
  const continueInflightRef = useRef(false);
  const [continuing, setContinuing] = useState(false);

  const unauthenticated = unauthenticatedMcpConnections(connections);
  const ready = !loadError && isPreStreamReady(autoApproveAllTools, connections);

  const clearPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const settle = useCallback((value: boolean) => {
    pendingRef.current?.resolve(value);
    pendingRef.current = null;
    pendingMcpRef.current = null;
    setOauthOrigin(null);
    setOpen(false);
    setLoadError(null);
    clearPoll();
  }, [clearPoll]);

  const loadConnections = useCallback(async () => {
    const rows = await fetchMcpOAuthConnections();
    setConnections(rows);
    setLoadError(null);
    return rows;
  }, []);

  const refreshAfterAuth = useCallback(
    async (mcpName: string) => {
      if (refreshingRef.current || pendingMcpRef.current !== mcpName) return;
      refreshingRef.current = true;
      try {
        const rows = await loadConnections();
        const nowConnected = rows.some((row) => row.mcp_name === mcpName && row.connected);
        if (nowConnected) {
          pendingMcpRef.current = null;
          clearPoll();
          dispatch(addToast({ title: `${mcpName} connected`, variant: 'success' }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to refresh OAuth connections';
        setLoadError(message);
      } finally {
        refreshingRef.current = false;
      }
    },
    [clearPoll, dispatch, loadConnections],
  );

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

  useEffect(
    () => () => {
      pendingMcpRef.current = null;
      clearPoll();
    },
    [clearPoll],
  );

  const authenticate = useCallback(
    async (mcpName: string) => {
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
        setLoadError(message);
        dispatch(addToast({ title: message, variant: 'danger' }));
      } finally {
        setBusyMcp(null);
      }
    },
    [clearPoll, dispatch, refreshAfterAuth],
  );

  const waitForUser = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current = { resolve };
      setOpen(true);
    });
  }, []);

  const ensureReady = useCallback(async () => {
    if (inflightRef.current) return false;

    const run = (async () => {
      try {
        const rows = await loadConnections();
        if (isPreStreamReady(autoApproveRef.current, rows)) return true;
        return waitForUser();
      } catch (err) {
        setConnections([]);
        setLoadError(err instanceof Error ? err.message : 'Failed to load OAuth connections');
        return waitForUser();
      }
    })();

    inflightRef.current = run;
    try {
      return await run;
    } finally {
      if (inflightRef.current === run) inflightRef.current = null;
    }
  }, [loadConnections, waitForUser]);

  const handleRetry = useCallback(() => {
    void loadConnections().catch((err: unknown) => {
      setLoadError(err instanceof Error ? err.message : 'Failed to load OAuth connections');
    });
  }, [loadConnections]);

  const handleContinue = useCallback(() => {
    if (continueInflightRef.current) return;
    continueInflightRef.current = true;
    setContinuing(true);
    void loadConnections()
      .then((rows) => {
        if (!isPreStreamReady(autoApproveRef.current, rows)) return;
        settle(true);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load OAuth connections');
      })
      .finally(() => {
        continueInflightRef.current = false;
        setContinuing(false);
      });
  }, [loadConnections, settle]);

  const modal = (
    <PreStreamGateModal
      isOpen={open}
      autoApproveAllTools={autoApproveAllTools}
      unauthenticated={unauthenticated}
      ready={ready && !continuing}
      loadError={loadError}
      busyMcp={busyMcp}
      onToggleAutoApprove={(checked) => dispatch(setAutoApproveAllTools(checked))}
      onAuthenticate={(mcpName) => void authenticate(mcpName)}
      onRetry={handleRetry}
      onContinue={handleContinue}
      onCancel={() => settle(false)}
    />
  );

  return { ensureReady, modal };
}
