import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  EmptyStateBody,
  Label,
  Switch,
  Title,
} from '@patternfly/react-core';
import { ShieldAltIcon, TrashIcon } from '@patternfly/react-icons';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  selectAlwaysAllowedTools,
  selectAutoApproveAllTools,
  removeAlwaysAllowedTool,
  clearAlwaysAllowedTools,
  setAutoApproveAllTools,
} from '@/redux/slices/userSettings';

export function AlwaysAllowedTools() {
  const dispatch = useAppDispatch();
  const tools = useAppSelector(selectAlwaysAllowedTools);
  const autoApproveAll = useAppSelector(selectAutoApproveAllTools);

  return (
    <div className="app-settings__stack">
      <Card isCompact>
        <CardBody>
          <div className="app-settings__row">
            <div>
              <Title headingLevel="h3" size="md">
                Auto-Approve All Tools{' '}
                {autoApproveAll && (
                  <Label color="green" isCompact>
                    Active
                  </Label>
                )}
              </Title>
              <p className="app-settings__muted">
                Automatically approve all tool calls without prompting
              </p>
            </div>
            <Switch
              id="auto-approve-all-switch"
              aria-label="Toggle auto-approve all tools"
              isChecked={autoApproveAll}
              onChange={(_, checked) => dispatch(setAutoApproveAllTools(checked))}
            />
          </div>
        </CardBody>
      </Card>

      {autoApproveAll && (
        <Alert component="h3" isInline variant="warning" title="Tool approvals are bypassed">
          All tools will execute automatically without approval. Individual tool permissions below
          are bypassed.
        </Alert>
      )}

      <div style={autoApproveAll ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
        <Title headingLevel="h3" size="md" style={{ marginBlockEnd: 'var(--pf-t--global--spacer--md)' }}>
          Individual Tool Permissions
        </Title>
        {tools.length === 0 ? (
          <EmptyState headingLevel="h4" titleText="No tools are always allowed yet." icon={ShieldAltIcon} variant="sm">
            <EmptyStateBody>
              When the agent asks for approval to run a tool, click &quot;Always allow&quot; to skip
              approval for that tool in future runs.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <div className="app-settings__stack">
            <p className="app-settings__muted">
              These tools are automatically approved without showing an approval prompt. You can
              revoke access for any tool at any time.
            </p>

            <ul className="app-settings__list">
              {tools.map((tool) => (
                <li key={tool}>
                  <Card isCompact style={{ width: '100%' }}>
                    <CardBody>
                      <div className="app-settings__row">
                        <code className="app-nav-truncate">{tool}</code>
                        <Button
                          variant="plain"
                          icon={<TrashIcon />}
                          aria-label={`Revoke always-allow for ${tool}`}
                          onClick={() => dispatch(removeAlwaysAllowedTool(tool))}
                        />
                      </div>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>

            <div>
              <Button variant="secondary" onClick={() => dispatch(clearAlwaysAllowedTools())}>
                Revoke all
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
