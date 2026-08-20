import React, { useState } from 'react';
import {
  Button,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  Tooltip,
} from '@patternfly/react-core';
import { buildAppPath } from '../lib/app-paths';
import { useEvalStatus } from '../hooks/useEvalStatus';

interface McpAuthRequired {
  name: string;
  connect_url: string;
}

export function EvalPanel() {
  const { state: eval_ } = useEvalStatus();
  const [triggering, setTriggering] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [authRequired, setAuthRequired] = useState<McpAuthRequired[]>([]);

  const badge = () => {
    switch (eval_.status) {
      case 'not_started':
        return <Label color="grey">Queued</Label>;
      case 'in_progress':
        return <Label color="blue">Running</Label>;
      case 'completed':
        return (
          <Label color="green">
            {eval_.score !== null ? `${Math.round(eval_.score * 100)}%` : 'Done'} —{' '}
            {eval_.pass}✓ {eval_.fail}✗
          </Label>
        );
      case 'failed':
        return <Label color="red">Failed</Label>;
      default:
        return null;
    }
  };

  const handleEvaluate = async (force = false) => {
    setTriggering(true);
    try {
      // Call trigger — agentpod handles cache check, in_progress guard, and starting the eval pod
      const triggerPath = force
        ? '/api/proxy/agent/evals/force-trigger'
        : '/api/proxy/agent/evals/trigger';
      try {
        const triggerRes = await fetch(buildAppPath(triggerPath), {
          method: 'POST',
          credentials: 'same-origin',
        });

        if (triggerRes.status === 403) {
          const body = await triggerRes.json().catch(() => ({})) as { auth_required?: McpAuthRequired[]; detail?: { auth_required?: McpAuthRequired[] } };
          const authReq = body.auth_required ?? body.detail?.auth_required;
          if (authReq?.length) {
            setAuthRequired(authReq);
            return;
          }
        }

        if (triggerRes.ok) {
          const triggerData = (await triggerRes.json()) as Record<string, unknown>;
          if (
            (triggerData as { cached?: boolean }).cached ||
            (triggerData.eval_status === 'in_progress' &&
              (triggerData as { message?: string }).message)
          ) {
            return;
          }
        }
      } catch {
        // endpoint not available — nothing to do
        return;
      }
    } catch {
      // ignore — status polling will reflect outcome
    } finally {
      setTriggering(false);
    }
  };

  const isRunning = triggering || eval_.status === 'in_progress';

  return (
    <div
      style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--pf-global--BorderColor--100)',
      }}
    >
      {/* MCP auth required inline notice */}
      {authRequired.length > 0 && (
        <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--pf-global--BackgroundColor--200)', marginBottom: 8 }}>
          <p style={{ marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
            Connect required services before running eval:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {authRequired.map((server) => (
              <Button
                key={server.name}
                variant="primary"
                size="sm"
                onClick={() => {
                  fetch(buildAppPath(`/api/proxy/agent${server.connect_url}`), { method: 'POST', credentials: 'same-origin' })
                    .then((r) => r.json())
                    .then((b: { authorize_url?: string }) => {
                      if (b.authorize_url) window.open(b.authorize_url, `mcp-connect-${server.name}`, 'width=600,height=700');
                    })
                    .catch(() => undefined);
                }}
              >
                Connect {server.name.charAt(0).toUpperCase() + server.name.slice(1)}
              </Button>
            ))}
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--pf-global--Color--200)' }}>
            After connecting, click Evaluate again.
          </p>
        </div>
      )}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
      >
        <Button
          variant="secondary"
          size="sm"
          isLoading={isRunning}
          isDisabled={isRunning}
          onClick={() => void handleEvaluate(false)}
        >
          Evaluate
        </Button>

        {eval_.status === 'completed' && (
          <Tooltip content="Force re-run, bypassing cached result">
            <Button
              variant="plain"
              size="sm"
              aria-label="Force re-evaluate"
              isDisabled={isRunning}
              onClick={() => void handleEvaluate(true)}
            >
              ↺
            </Button>
          </Tooltip>
        )}

        {badge()}
      </div>

      {eval_.status === 'completed' && (
        <Button variant="link" isInline onClick={() => setResultsOpen(true)}>
          View report
        </Button>
      )}

      <Modal
        variant={ModalVariant.small}
        isOpen={resultsOpen}
        onClose={() => setResultsOpen(false)}
        aria-label="Eval report"
      >
        <ModalHeader title="Eval Report" />
        <ModalBody>
          <p>
            <strong>Score:</strong>{' '}
            {eval_.score !== null ? `${Math.round(eval_.score * 100)}%` : '—'}
          </p>
          <p>
            <strong>Pass:</strong> {eval_.pass}&nbsp;&nbsp;
            <strong>Fail:</strong> {eval_.fail}&nbsp;&nbsp;
            <strong>Error:</strong> {eval_.error}
          </p>
          <p>
            <strong>Config hash:</strong> <code>{eval_.configHash || '—'}</code>
          </p>
        </ModalBody>
      </Modal>
    </div>
  );
}
