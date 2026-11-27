import React, { useState } from 'react';
import {
  Alert,
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  HelperText,
  HelperTextItem,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  Tooltip,
} from '@patternfly/react-core';
import { RedoIcon } from '@patternfly/react-icons';
import './dialogs.css';
import { buildAppPath } from '../lib/app-paths';
import { useEvalStatus } from '../hooks/useEvalStatus';
import type { McpAuthRequired } from '../hooks/useEvalDashboard';

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

/** Sidebar panel for triggering eval runs and displaying status badges and a summary report modal. */
export function EvalPanel() {
  const { state: eval_, refresh } = useEvalStatus();
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [connectError, setConnectError] = useState('');
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
    setTriggerError('');
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

        if (!triggerRes.ok) {
          const errBody = await triggerRes.json().catch(() => ({})) as { detail?: string };
          const errFriendly: Record<number, string> = {
            429: 'Too many requests — wait a moment and try again.',
            502: 'Could not reach the eval runner — check your deployment.',
          };
          const msg = errBody.detail
            ?? errFriendly[triggerRes.status]
            ?? `Trigger failed (${triggerRes.status}) — check the agent logs.`;
          setTriggerError(msg);
          return;
        }

        if (triggerRes.ok) {
          refresh();
        }
      } catch {
        setTriggerError('Could not reach the eval service — check your connection.');
        return;
      }
    } catch (e) {
      setTriggerError(String(e));
    } finally {
      setTriggering(false);
    }
  };

  const isRunning = triggering || eval_.status === 'in_progress';

  return (
    <div className="app-eval">
      {/* MCP auth required inline notice */}
      {authRequired.length > 0 && (
        <Alert
          variant="info"
          isInline
          isPlain
          className="app-eval__notice"
          title="Connect required services before running eval"
        >
          <div className="app-eval__connect">
            {authRequired.map((server) => (
              <Button
                key={server.name}
                variant="primary"
                size="sm"
                onClick={() => {
                  setConnectError('');
                  if (!isSafeConnectUrl(server.connect_url)) {
                    setConnectError('Invalid connect URL from server.');
                    return;
                  }
                  fetch(buildAppPath(`/api/proxy/agent${server.connect_url}`), { method: 'POST', credentials: 'same-origin' })
                    .then((r) => r.json())
                    .then((b: { authorize_url?: string }) => {
                      if (b.authorize_url) {
                        safeOpenAuthorize(b.authorize_url, `mcp-connect-${server.name}`, 'width=600,height=700');
                      } else {
                        setConnectError('No authorization URL returned — check the MCP server config.');
                      }
                    })
                    .catch(() => setConnectError('Could not reach the MCP server — check your connection.'));
                }}
              >
                Connect {server.name.charAt(0).toUpperCase() + server.name.slice(1)}
              </Button>
            ))}
            {connectError && (
              <HelperText>
                <HelperTextItem variant="error">{connectError}</HelperTextItem>
              </HelperText>
            )}
            <Content component="small">After connecting, click Evaluate again.</Content>
          </div>
        </Alert>
      )}
      <div className="app-eval__row">
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
              <RedoIcon />
            </Button>
          </Tooltip>
        )}

        {badge()}
      </div>
      {triggerError && (
        <HelperText>
          <HelperTextItem variant="error">{triggerError}</HelperTextItem>
        </HelperText>
      )}

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
          <DescriptionList isHorizontal isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>Score</DescriptionListTerm>
              <DescriptionListDescription>
                {eval_.score !== null ? `${Math.round(eval_.score * 100)}%` : '—'}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Pass</DescriptionListTerm>
              <DescriptionListDescription>{eval_.pass}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Fail</DescriptionListTerm>
              <DescriptionListDescription>{eval_.fail}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Error</DescriptionListTerm>
              <DescriptionListDescription>{eval_.error}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Config hash</DescriptionListTerm>
              <DescriptionListDescription><code>{eval_.configHash || '—'}</code></DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </ModalBody>
      </Modal>
    </div>
  );
}
