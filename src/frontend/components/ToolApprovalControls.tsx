import { useEffect, useRef } from 'react';
import { Button, Label } from '@patternfly/react-core';
import { CheckIcon, ShieldAltIcon } from '@patternfly/react-icons';
import type { ToolApproval } from '../hooks/useInterruptApprovals';
import './tool-approval.css';

export function ToolApprovalControls({ approval }: { approval: ToolApproval }) {
  const approveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!approval.disabled && !approval.decision) approveRef.current?.focus({ preventScroll: true });
  }, [approval.disabled, approval.decision]);
  if (approval.decision) return null;
  const name = approval.request.name;
  return (
    <div role="alert" aria-live="assertive" aria-label={`Tool call ${name} requires approval`} className="app-approval">
      <div className="app-approval__header">
        <Label color="orange" isCompact>Approval required</Label>
      </div>
      {approval.waitingForResume && (
        <p className="app-approval__hint">Waiting for the current approval to finish…</p>
      )}
      <div className="app-approval__actions">
        <Button ref={approveRef} variant="primary" size="sm" icon={<CheckIcon />} isDisabled={approval.disabled}
          onClick={() => approval.decide({ type: 'approve' })} aria-label={`Approve tool call: ${name}`}>
          Approve
        </Button>
        <Button variant="danger" isDanger size="sm" isDisabled={approval.disabled}
          onClick={() => approval.decide({ type: 'reject', message: 'User rejected this action.' })}
          aria-label={`Reject tool call: ${name}`}>
          Reject
        </Button>
        {approval.alwaysAllow && (
          <Button variant="secondary" size="sm" icon={<ShieldAltIcon />} isDisabled={approval.disabled}
            onClick={approval.alwaysAllow} aria-label={`Always allow tool: ${name}`}>
            Always allow
          </Button>
        )}
      </div>
    </div>
  );
}
