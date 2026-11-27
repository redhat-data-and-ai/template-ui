import { Alert, Button, Checkbox } from '@patternfly/react-core';
import { CheckCircleIcon, DatabaseIcon } from '@patternfly/react-icons';
import { buildAppPath } from '../../../lib/app-paths';
import type { ActionState } from './eval-types';

interface EvalControlsProps {
  onTrigger: (force: boolean) => void;
  isRunning: boolean;
  triggerState: ActionState;
  forceMode: boolean;
  onForceModeChange: (force: boolean) => void;
  hasDataset?: boolean;
}

/** Toolbar with the Evaluate button, dataset link, force-rerun toggle, and status feedback. */
export function EvalControls({
  onTrigger,
  isRunning,
  triggerState,
  forceMode,
  onForceModeChange,
  hasDataset = false,
}: EvalControlsProps) {
  return (
    <div className="app-settings__stack" style={{ gap: 'var(--pf-t--global--spacer--sm)' }}>
      <div className="app-settings__row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={() => onTrigger(forceMode)} isDisabled={isRunning}>
          {triggerState.status === 'loading' && isRunning ? 'Running…' : 'Evaluate'}
        </Button>

        <Button
          variant="secondary"
          onClick={() => window.open(buildAppPath('/eval/dataset'), '_blank', 'noopener')}
          aria-label={hasDataset ? 'Dataset (has test cases)' : 'Dataset'}
          icon={<DatabaseIcon />}
        >
          Dataset
          {hasDataset && (
            <>
              {' '}
              <CheckCircleIcon color="var(--pf-t--global--icon--color--status--success--default)" aria-hidden="true" />
            </>
          )}
        </Button>

        <Checkbox
          id="eval-force-rerun"
          label="Force re-run"
          isChecked={forceMode}
          isDisabled={isRunning}
          onChange={(_event, checked) => onForceModeChange(checked)}
        />
      </div>

      {triggerState.message && (
        <Alert
          isInline
          variant={triggerState.status === 'success' ? 'success' : triggerState.status === 'error' ? 'danger' : 'info'}
          title={triggerState.message}
        />
      )}
    </div>
  );
}
