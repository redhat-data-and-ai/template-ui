import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Switch,
} from '@patternfly/react-core';
import { Link2 } from 'lucide-react';
import type { McpOAuthConnection } from '../services/mcp-oauth-api';

function displayName(connection: McpOAuthConnection): string {
  const description = (connection.description ?? '').trim();
  return description || connection.mcp_name;
}

export interface PreStreamGateModalProps {
  readonly isOpen: boolean;
  readonly autoApproveAllTools: boolean;
  readonly unauthenticated: McpOAuthConnection[];
  readonly ready: boolean;
  readonly loadError: string | null;
  readonly busyMcp: string | null;
  readonly onToggleAutoApprove: (checked: boolean) => void;
  readonly onAuthenticate: (mcpName: string) => void;
  readonly onRetry: () => void;
  readonly onContinue: () => void;
  readonly onCancel: () => void;
}

export function PreStreamGateModal({
  isOpen,
  autoApproveAllTools,
  unauthenticated,
  ready,
  loadError,
  busyMcp,
  onToggleAutoApprove,
  onAuthenticate,
  onRetry,
  onContinue,
  onCancel,
}: PreStreamGateModalProps) {
  return (
    <Modal
      variant={ModalVariant.small}
      isOpen={isOpen}
      onClose={onCancel}
      aria-label="Connect before chatting"
    >
      <ModalHeader title="Connect before chatting" />
      <ModalBody>
        <p className="text-sm text-muted-foreground mb-4">
          Turn on Auto-Approve All Tools and connect every MCP service before chatting with the
          agent.
        </p>
        {loadError && (
          <div className="mb-4 space-y-2">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        )}
        <div className="rounded-lg border border-border bg-muted/30 p-3 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Auto-Approve All Tools</p>
              <p className="text-xs text-muted-foreground mt-1">
                Required so the agent can run tools without stopping mid-chat.
              </p>
            </div>
            <Switch
              id="gate-auto-approve-switch"
              aria-label="Toggle auto-approve all tools"
              isChecked={autoApproveAllTools}
              onChange={(_, checked) => onToggleAutoApprove(checked)}
            />
          </div>
        </div>
        {unauthenticated.length > 0 && (
          <ul className="space-y-3">
            {unauthenticated.map((connection) => {
              const name = displayName(connection);
              const busy = busyMcp === connection.mcp_name;
              return (
                <li
                  key={connection.mcp_name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground break-words">{name}</p>
                    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground mt-1">
                      {connection.auth_mode}
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Link2 className="w-3.5 h-3.5" />}
                    isLoading={busy}
                    aria-label={`Authenticate ${name}`}
                    onClick={() => onAuthenticate(connection.mcp_name)}
                  >
                    Authenticate
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" isDisabled={!ready} onClick={onContinue}>
          Continue
        </Button>
        <Button variant="link" onClick={onCancel}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
