import { useState } from 'react';
import { Alert, AlertActionLink, Button, EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { buildAppPath } from '../../../lib/app-paths';
import { useEvalDashboard } from '../../../hooks/useEvalDashboard';
import { useDatasetPresence } from '../../../hooks/useDatasetPresence';
import type { EvalRow } from './eval-types';
import { EvalControls } from './EvalControls';
import { EvalStatusBar } from './EvalStatusBar';
import { MetricTrendsSection } from './MetricTrendsSection';
import { EvalRunsTable } from './EvalRunsTable';
import { FullReportModal } from './FullReportModal';
import { isLiveEvalRun } from './eval-utils';

/** Validates that a connect URL is a safe relative path without traversal sequences. */
function isSafeConnectUrl(url: string): boolean {
  return /^\/[a-zA-Z0-9/_-]+$/.test(url) && !url.includes('..');
}

/** Opens an authorization popup only if the URL uses the HTTPS protocol. */
function safeOpenAuthorize(url: string, target: string, features: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return;
    window.open(url, target, `${features},noopener`);
  } catch { /* invalid URL — ignore */ }
}

/** Main eval settings view composing controls, status bar, trend charts, run history, and the full report modal. */
export function EvalDashboard() {
  const {
    evalState,
    isRunning,
    result,
    history,
    trends,
    triggerState,
    triggeredAt,
    isCached,
    hasTriggered,
    trigger,
    authRequired,
    clearAuthRequired,
  } = useEvalDashboard();
  const { hasCases } = useDatasetPresence();

  const [forceMode, setForceMode] = useState(false);
  const [reportData, setReportData] = useState<EvalRow | null>(null);
  const [connectErrors, setConnectErrors] = useState<Record<string, string>>({});

  const hasResult = result != null;
  const hasHistory = (history?.runs?.length ?? 0) > 0;

  return (
    <div className="app-settings__stack">
      <EvalControls
        onTrigger={trigger}
        isRunning={isRunning}
        triggerState={triggerState}
        forceMode={forceMode}
        onForceModeChange={setForceMode}
        hasDataset={hasCases}
      />

      {authRequired.length > 0 && (
        <Alert
          isInline
          variant="warning"
          title="Authentication required to run eval"
          actionLinks={<AlertActionLink onClick={clearAuthRequired}>Dismiss</AlertActionLink>}
        >
          <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--sm)' }}>
            {authRequired.map((server) => (
              <div key={server.name}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConnectErrors((e) => ({ ...e, [server.name]: '' }));
                    if (!isSafeConnectUrl(server.connect_url)) {
                      setConnectErrors((e) => ({ ...e, [server.name]: 'Invalid connect URL from server.' }));
                      return;
                    }
                    fetch(buildAppPath(`/api/proxy/agent${server.connect_url}`), { method: 'POST', credentials: 'same-origin' })
                      .then(async (r) => {
                        try {
                          const b = await r.json() as { authorize_url?: string; detail?: string; error?: string };
                          if (b.authorize_url) {
                            safeOpenAuthorize(b.authorize_url, `mcp-connect-${server.name}`, 'width=600,height=700');
                            return;
                          }
                        } catch { /* ignore parse error, fall through to status-based message */ }
                        // Map common HTTP errors to user-friendly messages
                        const friendly: Record<number, string> = {
                          401: 'Authentication required — check your session and try again.',
                          403: 'Access denied — you may not have permission to connect this service.',
                          404: 'Connect endpoint not found — check the MCP server URL in config.',
                          429: 'Too many requests — wait a moment and try again.',
                          502: 'Could not reach the MCP server — it may be down or misconfigured.',
                          503: 'MCP server unavailable — try again shortly.',
                          0:   'Network error — check your connection.',
                        };
                        const msg = friendly[r.status] ?? friendly[0];
                        setConnectErrors((e) => ({ ...e, [server.name]: msg }));
                      })
                      .catch(() => {
                        setConnectErrors((e) => ({ ...e, [server.name]: 'Network error — could not reach the server.' }));
                      });
                  }}
                >
                  Authenticate {server.name.charAt(0).toUpperCase() + server.name.slice(1)}
                </Button>
                {connectErrors[server.name] && (
                  <p className="app-settings__muted">{connectErrors[server.name]}</p>
                )}
              </div>
            ))}
            <p>After authenticating, click Evaluate again.</p>
          </div>
        </Alert>
      )}

      <EvalStatusBar
        status={
          isLiveEvalRun({ evalStatus: evalState.status, triggerStatus: triggerState.status })
          || (hasTriggered && evalState.status === 'unknown' && triggerState.status !== 'error')
            ? 'in_progress'
            : evalState.status
        }
        score={evalState.score}
        pass={evalState.pass}
        fail={evalState.fail}
        error={evalState.error}
        triggeredAt={triggeredAt}
        isCached={isCached}
      />

      {trends && <MetricTrendsSection data={trends} />}

      {hasHistory && history && (
        <EvalRunsTable
          runs={history.runs}
          onViewReport={setReportData}
        />
      )}

      {!hasResult && !isRunning && !hasHistory &&
        evalState.status !== 'no_dataset' &&
        evalState.status !== 'error' &&
        evalState.status !== 'failed' && (
        <EmptyState headingLevel="h4" titleText="No evaluation history yet" variant="sm">
          <EmptyStateBody>Run your first eval to see results and trends.</EmptyStateBody>
        </EmptyState>
      )}

      {reportData && (
        <FullReportModal
          result={reportData}
          prevScore={null}
          onClose={() => setReportData(null)}
        />
      )}
    </div>
  );
}
